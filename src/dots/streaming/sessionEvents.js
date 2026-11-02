/**
 * Live session event stream.
 *
 * The generated `events` request builder cannot surface this incrementally: it
 * resolves once the response body closes, and a live attach never closes. This
 * helper reads the same endpoint frame by frame instead.
 */
import { HttpMethod, openStream, prepareRequest, } from "./harnessStream.js";
import { readSseFrames } from "./sseFrames.js";
import { EventsRequestBuilderUriTemplate } from "../v2/agents/sessions/item/events/index.js";
/** How many event ids to remember when discarding duplicates. */
const SEEN_EVENT_LIMIT = 4096;
/**
 * Attaches to a session and yields its events as they arrive.
 *
 * Delivery is at-least-once, so an event id already seen on this connection is
 * discarded. Events are yielded in arrival order, not id order — order them by
 * `eventId`, never by any `seq` field, when order matters to you.
 *
 * Keepalive comments the server sends every few seconds are consumed here and
 * never yielded, so an idle stream is silent rather than noisy.
 *
 * Unless `replayOnly` is set the iteration only ends when the session ends, the
 * `signal` aborts, or the caller breaks out of the loop.
 */
export async function* streamSessionEvents(options) {
    const request = await prepareRequest(HttpMethod.GET, EventsRequestBuilderUriTemplate, { session_id: options.sessionId }, {
        cursor: options.cursor,
        device_id: options.deviceId,
        replay_from: options.replayFrom,
        replay_only: options.replayOnly,
    }, options, { Accept: "text/event-stream" });
    const response = await openStream(request, { method: "GET" }, options);
    const seen = new Set();
    for await (const frame of readSseFrames(response.body, options.signal)) {
        if (frame.id !== undefined) {
            if (seen.has(frame.id))
                continue;
            seen.add(frame.id);
            // Bound the set so a long attach does not grow without limit. The
            // window only needs to outlive a redelivery, which is immediate.
            if (seen.size > SEEN_EVENT_LIMIT) {
                const oldest = seen.values().next();
                if (!oldest.done)
                    seen.delete(oldest.value);
            }
        }
        yield {
            type: frame.event ?? "message",
            eventId: frame.id,
            data: tryParseJson(frame.data),
            raw: frame.data,
        };
    }
}
/**
 * Reads a finite replay into an array.
 *
 * Forces `replayOnly`, since the live stream does not end on its own and would
 * never return.
 */
export async function collectSessionEvents(options) {
    const events = [];
    for await (const event of streamSessionEvents({ ...options, replayOnly: true })) {
        events.push(event);
    }
    return events;
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
