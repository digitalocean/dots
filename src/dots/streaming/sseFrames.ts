/**
 * Frame-level Server-Sent Events parsing.
 *
 * StreamingRequestAdapter reads only `data:` lines, which is enough for a stream
 * whose frames are all the same kind. The Harness Runtime streams are not: the
 * session event stream dispatches on `event:` and resumes from `id:`, and
 * sandbox exec tells stdout from stderr the same way. This module keeps the
 * whole frame so those helpers can see it.
 */

/** One complete Server-Sent Event. */
export interface SseFrame {
    /** The `event:` field, absent when the frame carried none. */
    event?: string;
    /** The `data:` fields, joined with newlines as the SSE grammar requires. */
    data: string;
    /** The `id:` field. Echo it as `Last-Event-ID` to resume after this frame. */
    id?: string;
    /** The `retry:` field, in milliseconds. */
    retry?: number;
}

/**
 * Splits off every complete frame in `buffer` and returns the trailing partial
 * one, which the caller prepends to the next chunk.
 *
 * Comment lines (`: keepalive`) set no field, so a frame made only of comments
 * yields nothing rather than an empty event.
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
    // Normalize the three line endings the grammar allows before splitting, so a
    // frame boundary is always exactly "\n\n".
    const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const blocks = normalized.split("\n\n");
    const rest = blocks.pop() ?? "";

    const frames: SseFrame[] = [];
    for (const block of blocks) {
        const frame = parseFrameBlock(block);
        if (frame) frames.push(frame);
    }
    return { frames, rest };
}

/**
 * Parses one frame. Returns undefined when the block sets no field, which is
 * the case for a keepalive comment and for stray blank lines.
 */
function parseFrameBlock(block: string): SseFrame | undefined {
    const dataLines: string[] = [];
    let event: string | undefined;
    let id: string | undefined;
    let retry: number | undefined;
    let sawField = false;

    for (const line of block.split("\n")) {
        if (line === "" || line.startsWith(":")) continue;

        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        // A single leading space after the colon is part of the delimiter.
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);

        switch (field) {
            case "data":
                dataLines.push(value);
                sawField = true;
                break;
            case "event":
                event = value;
                sawField = true;
                break;
            case "id":
                // The grammar says to ignore an id containing a NULL.
                if (!value.includes("\0")) id = value;
                sawField = true;
                break;
            case "retry": {
                const ms = Number(value);
                if (Number.isInteger(ms) && ms >= 0) retry = ms;
                sawField = true;
                break;
            }
            default:
                // Unknown fields are ignored, per the grammar.
                break;
        }
    }

    if (!sawField) return undefined;
    return { event, data: dataLines.join("\n"), id, retry };
}

/**
 * Reads `body` to exhaustion and yields each complete frame.
 *
 * Aborting `signal` ends the iteration without an error, including while a read
 * is in flight. Leaving the loop early (`break`, `return` or a throw in the
 * loop body) cancels the response body, so the connection closes instead of
 * staying open in the background.
 *
 * A frame the server had not finished when the stream ended is dropped, as the
 * SSE grammar requires: it was cut off, and a caller that resumes from the last
 * complete event id gets it again in full.
 *
 * `onActivity` runs for every chunk read, keepalive comments included, so a
 * caller can tell a quiet stream from a dead one.
 */
export async function* readSseFrames(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
    onActivity?: () => void,
): AsyncGenerator<SseFrame> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const abort = () => void reader.cancel().catch(() => undefined);
    signal?.addEventListener("abort", abort);

    try {
        for (;;) {
            if (signal?.aborted) return;

            let chunk: Awaited<ReturnType<typeof reader.read>>;
            try {
                chunk = await reader.read();
            } catch (err) {
                if (signal?.aborted) return;
                throw err;
            }
            if (chunk.done) return;
            onActivity?.();

            buffer += decoder.decode(chunk.value, { stream: true });
            const { frames, rest } = parseSseFrames(buffer);
            buffer = rest;
            for (const frame of frames) yield frame;
        }
    } finally {
        signal?.removeEventListener("abort", abort);
        // Cancelling a finished body is a no-op; cancelling an unfinished one is
        // what closes the connection when the caller stops early.
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
