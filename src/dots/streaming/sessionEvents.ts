/**
 * Session event stream.
 *
 * The generated `events` request builder cannot surface this incrementally: it
 * resolves once the response body closes, and a live attach never closes. This
 * helper reads the same endpoint frame by frame instead, and follows the
 * stream's own resume rules so a dropped connection does not lose or repeat
 * events.
 */

import {
    HarnessStreamError,
    HttpMethod,
    openStream,
    prepareRequest,
    type HarnessStreamOptions,
} from "./harnessStream.js";
import { readSseFrames } from "./sseFrames.js";
import { EventsRequestBuilderUriTemplate } from "../v2/agents/sessions/item/events/index.js";

/** One event off the stream. */
export interface SessionEvent {
    /** The canonical event type, such as `run.token_delta` or `stream.state`. */
    type: string;
    /** The event's ULID. Pass it back as `cursor` to resume after it. */
    eventId?: string;
    /** The run the event belongs to, absent for session-level events. */
    runId?: string;
    /** The parsed `data:` envelope, or undefined when it was not JSON. */
    data: unknown;
    /** The envelope's own `data` field: the per-type payload. */
    payload?: unknown;
    /** The raw `data:` text, for a payload this SDK does not model yet. */
    raw: string;
}

/** Options for {@link streamSessionEvents}. */
export interface SessionEventStreamOptions extends HarnessStreamOptions {
    /** The session to attach to. */
    sessionId: string;
    /**
     * Live attach: the last event this caller has handled. The stream resumes
     * strictly after it. The replay lane reads `replayFrom` instead.
     */
    cursor?: string;
    /** Replay lane only: return events after this id. Defaults to `cursor`. */
    replayFrom?: string;
    /** Replay the backlog and end, rather than staying attached. */
    replayOnly?: boolean;
    /** Identifies this consumer to the server. */
    deviceId?: string;
    /**
     * Reconnect a live attach that drops, resuming after the last event the
     * caller handled. Defaults to true for a live attach. A replay never
     * reconnects.
     */
    reconnect?: boolean;
    /** Reconnect attempts in a row before giving up. Defaults to 10. */
    maxReconnects?: number;
    /**
     * A connection with no bytes for this long is treated as lost. The server
     * sends a keepalive about every 15 s. Defaults to 45 s; 0 disables it.
     */
    idleTimeoutMs?: number;
    /** First reconnect delay, doubled per attempt up to 15 s. Defaults to 500 ms. */
    retryBaseDelayMs?: number;
}

/** How many event ids to remember when discarding duplicates. */
const SEEN_EVENT_LIMIT = 4096;
const MAX_RETRY_DELAY_MS = 15_000;

/**
 * Attaches to a session and yields its events as they arrive.
 *
 * Delivery is at-least-once, so an event id already seen on this stream is
 * discarded, across reconnects too. Events are yielded in arrival order;
 * order them by `eventId` when order matters to you.
 *
 * A live attach reconnects when the connection drops or goes silent, resuming
 * after the last event the loop body finished with. Two `stream.state` frames
 * change that:
 *
 * - `superseded`: another attach from the same device took over. The frame is
 *   yielded and the iteration ends, because reconnecting would fight it.
 * - `rolled_back`: the session was restored to an earlier checkpoint. The frame
 *   is yielded, the resume point is discarded, and the stream reattaches from
 *   the head so the restored transcript is read again.
 *
 * The iteration ends when the signal aborts, the caller leaves the loop, a
 * replay finishes, or reconnecting fails `maxReconnects` times in a row. An
 * error response other than 429 or 5xx is raised at once.
 */
export async function* streamSessionEvents(
    options: SessionEventStreamOptions,
): AsyncGenerator<SessionEvent> {
    const live = !options.replayOnly;
    const reconnect = live && options.reconnect !== false;
    const maxReconnects = options.maxReconnects ?? 10;
    const idleTimeoutMs = options.idleTimeoutMs ?? 45_000;
    const baseDelayMs = options.retryBaseDelayMs ?? 500;

    const seen = new Set<string>();
    let cursor = options.cursor;
    let failures = 0;

    for (;;) {
        if (options.signal?.aborted) return;

        const connection = linkedAbort(options.signal);
        const idle = idleTimer(idleTimeoutMs, () => connection.abort());
        let retryAfterMs: number | undefined;
        let rolledBack = false;

        try {
            const request = await prepareRequest(
                HttpMethod.GET,
                EventsRequestBuilderUriTemplate,
                { session_id: options.sessionId },
                live
                    ? { cursor, device_id: options.deviceId }
                    : {
                          replay_from: options.replayFrom ?? cursor,
                          replay_only: true,
                          device_id: options.deviceId,
                      },
                options,
                { Accept: "text/event-stream" },
            );
            const response = await openStream(
                request,
                { method: "GET" },
                { ...options, signal: connection.signal },
            );
            idle.reset();

            for await (const frame of readSseFrames(response.body!, connection.signal, idle.reset)) {
                const event = toEvent(frame.event, frame.id, frame.data);
                failures = 0;

                if (event.eventId !== undefined) {
                    if (seen.has(event.eventId)) continue;
                    remember(seen, event.eventId);
                }

                const state = streamState(event);
                if (state === "superseded") {
                    yield event;
                    return;
                }
                if (state === "rolled_back") {
                    cursor = undefined;
                    seen.clear();
                    rolledBack = true;
                    yield event;
                    break;
                }

                yield event;
                // Advanced only once the caller has finished with the event, so a
                // drop while it was being handled delivers it again, never skips it.
                if (event.eventId !== undefined) cursor = event.eventId;
            }
        } catch (err) {
            if (options.signal?.aborted) return;
            if (!reconnect || !isRetryable(err)) throw err;
            if (err instanceof HarnessStreamError && err.retryAfter !== undefined) {
                retryAfterMs = err.retryAfter * 1000;
            }
        } finally {
            idle.stop();
            connection.abort();
        }

        if (options.signal?.aborted || !reconnect) return;
        if (rolledBack) continue;

        failures++;
        if (failures > maxReconnects) {
            throw new HarnessStreamError(
                `session event stream lost after ${maxReconnects} reconnect attempts`,
                0,
            );
        }
        const delay =
            retryAfterMs ?? Math.min(baseDelayMs * 2 ** (failures - 1), MAX_RETRY_DELAY_MS);
        await sleep(delay, options.signal);
    }
}

/** A finished replay of a session's events. */
export interface SessionEventReplay {
    /** The replayed events, oldest first, without `stream.state` frames. */
    events: SessionEvent[];
    /**
     * True when the server served less than the requested history, as its
     * opening `stream.state` frame reports.
     */
    truncated: boolean;
}

/**
 * Reads a finite replay of a session's events.
 *
 * Uses the replay lane, which resumes after `replayFrom` (or `cursor`), and
 * reports whether the server truncated the history it served.
 */
export async function collectSessionEvents(
    options: SessionEventStreamOptions,
): Promise<SessionEventReplay> {
    const events: SessionEvent[] = [];
    let truncated = false;
    for await (const event of streamSessionEvents({ ...options, replayOnly: true })) {
        if (event.type === "stream.state") {
            const payload = event.payload as { truncated?: boolean } | undefined;
            if (payload?.truncated) truncated = true;
            continue;
        }
        events.push(event);
    }
    return { events, truncated };
}

function toEvent(eventField: string | undefined, idField: string | undefined, raw: string): SessionEvent {
    const data = tryParseJson(raw);
    const envelope = isRecord(data) ? data : undefined;
    return {
        type: stringField(envelope, "type") ?? eventField ?? "message",
        eventId: stringField(envelope, "event_id") ?? idField,
        runId: stringField(envelope, "run_id"),
        data,
        payload: envelope && "data" in envelope ? envelope.data : undefined,
        raw,
    };
}

function streamState(event: SessionEvent): string | undefined {
    if (event.type !== "stream.state") return undefined;
    const payload = event.payload;
    return isRecord(payload) && typeof payload.state === "string" ? payload.state : undefined;
}

/** Network failures, 429 and 5xx are worth another attempt; other 4xx are not. */
function isRetryable(err: unknown): boolean {
    if (err instanceof HarnessStreamError) {
        return err.status === 0 || err.status === 429 || err.status >= 500;
    }
    return true;
}

function remember(seen: Set<string>, id: string): void {
    seen.add(id);
    // Bound the set so a long attach does not grow without limit.
    if (seen.size > SEEN_EVENT_LIMIT) {
        const oldest = seen.values().next();
        if (!oldest.done) seen.delete(oldest.value);
    }
}

function linkedAbort(parent?: AbortSignal): AbortController {
    const controller = new AbortController();
    if (parent?.aborted) controller.abort();
    else parent?.addEventListener("abort", () => controller.abort(), { once: true });
    return controller;
}

function idleTimer(timeoutMs: number, onIdle: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };
    const reset = () => {
        stop();
        if (timeoutMs > 0) timer = setTimeout(onIdle, timeoutMs);
    };
    return { reset, stop };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(done, ms);
        function done() {
            clearTimeout(timer);
            signal?.removeEventListener("abort", done);
            resolve();
        }
        signal?.addEventListener("abort", done, { once: true });
    });
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = record?.[key];
    return typeof value === "string" && value !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(raw: string): unknown {
    if (raw === "") return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}
