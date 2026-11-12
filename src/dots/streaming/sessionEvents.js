/**
 * Session event stream.
 *
 * The generated `events` request builder cannot surface this incrementally: it
 * resolves once the response body closes, and a live attach never closes. This
 * helper reads the same endpoint frame by frame instead, and follows the
 * stream's own resume rules so a dropped connection does not lose or repeat
 * events.
 */
import { HarnessStreamError, HttpMethod, openStream, prepareRequest, } from "./harnessStream.js";
import { readSseFrames } from "./sseFrames.js";
import { EventsRequestBuilderUriTemplate } from "../v2/agents/sessions/item/events/index.js";
/** How many event ids to remember when discarding duplicates. */
const SEEN_EVENT_LIMIT = 4096;
const MAX_RETRY_DELAY_MS = 15000;
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
export async function* streamSessionEvents(options) {
    const live = !options.replayOnly;
    const reconnect = live && options.reconnect !== false;
    const maxReconnects = options.maxReconnects ?? 10;
    const idleTimeoutMs = options.idleTimeoutMs ?? 45000;
    const baseDelayMs = options.retryBaseDelayMs ?? 500;
    const seen = new Set();
    let cursor = options.cursor;
    let failures = 0;
    for (;;) {
        if (options.signal?.aborted)
            return;
        const connection = linkedAbort(options.signal);
        const idle = idleTimer(idleTimeoutMs, () => connection.abort());
        let retryAfterMs;
        let rolledBack = false;
        try {
            const request = await prepareRequest(HttpMethod.GET, EventsRequestBuilderUriTemplate, { session_id: options.sessionId }, live
                ? { cursor, device_id: options.deviceId }
                : {
                    replay_from: options.replayFrom ?? cursor,
                    replay_only: true,
                    device_id: options.deviceId,
                }, options, { Accept: "text/event-stream" });
            const response = await openStream(request, { method: "GET" }, { ...options, signal: connection.signal });
            idle.reset();
            for await (const frame of readSseFrames(response.body, connection.signal, idle.reset)) {
                const event = toEvent(frame.event, frame.id, frame.data);
                failures = 0;
                if (event.eventId !== undefined) {
                    if (seen.has(event.eventId))
                        continue;
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
                if (event.eventId !== undefined)
                    cursor = event.eventId;
            }
        }
        catch (err) {
            if (options.signal?.aborted)
                return;
            if (!reconnect || !isRetryable(err))
                throw err;
            if (err instanceof HarnessStreamError && err.retryAfter !== undefined) {
                retryAfterMs = err.retryAfter * 1000;
            }
        }
        finally {
            idle.stop();
            connection.abort();
        }
        if (options.signal?.aborted || !reconnect)
            return;
        if (rolledBack)
            continue;
        failures++;
        if (failures > maxReconnects) {
            throw new HarnessStreamError(`session event stream lost after ${maxReconnects} reconnect attempts`, 0);
        }
        const delay = retryAfterMs ?? Math.min(baseDelayMs * 2 ** (failures - 1), MAX_RETRY_DELAY_MS);
        await sleep(delay, options.signal);
    }
}
/**
 * Reads a finite replay of a session's events.
 *
 * Uses the replay lane, which resumes after `replayFrom` (or `cursor`), and
 * reports whether the server truncated the history it served.
 */
export async function collectSessionEvents(options) {
    const events = [];
    let truncated = false;
    for await (const event of streamSessionEvents({ ...options, replayOnly: true })) {
        if (event.type === "stream.state") {
            const payload = event.payload;
            if (payload?.truncated)
                truncated = true;
            continue;
        }
        events.push(event);
    }
    return { events, truncated };
}
function toEvent(eventField, idField, raw) {
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
function streamState(event) {
    if (event.type !== "stream.state")
        return undefined;
    const payload = event.payload;
    return isRecord(payload) && typeof payload.state === "string" ? payload.state : undefined;
}
/** Network failures, 429 and 5xx are worth another attempt; other 4xx are not. */
function isRetryable(err) {
    if (err instanceof HarnessStreamError) {
        return err.status === 0 || err.status === 429 || err.status >= 500;
    }
    return true;
}
function remember(seen, id) {
    seen.add(id);
    // Bound the set so a long attach does not grow without limit.
    if (seen.size > SEEN_EVENT_LIMIT) {
        const oldest = seen.values().next();
        if (!oldest.done)
            seen.delete(oldest.value);
    }
}
function linkedAbort(parent) {
    const controller = new AbortController();
    if (parent?.aborted)
        controller.abort();
    else
        parent?.addEventListener("abort", () => controller.abort(), { once: true });
    return controller;
}
function idleTimer(timeoutMs, onIdle) {
    let timer;
    const stop = () => {
        if (timer !== undefined)
            clearTimeout(timer);
        timer = undefined;
    };
    const reset = () => {
        stop();
        if (timeoutMs > 0)
            timer = setTimeout(onIdle, timeoutMs);
    };
    return { reset, stop };
}
function sleep(ms, signal) {
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
function stringField(record, key) {
    const value = record?.[key];
    return typeof value === "string" && value !== "" ? value : undefined;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function tryParseJson(raw) {
    if (raw === "")
        return undefined;
    try {
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
