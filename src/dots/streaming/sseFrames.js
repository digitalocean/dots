/**
 * Frame-level Server-Sent Events parsing.
 *
 * StreamingRequestAdapter reads only `data:` lines, which is enough for a stream
 * whose frames are all the same kind. The Harness Runtime streams are not: the
 * session event stream dispatches on `event:` and resumes from `id:`, and
 * sandbox exec tells stdout from stderr the same way. This module keeps the
 * whole frame so those helpers can see it.
 */
/**
 * Splits off every complete frame in `buffer` and returns the trailing partial
 * one, which the caller prepends to the next chunk.
 *
 * Comment lines (`: keepalive`) set no field, so a frame made only of comments
 * yields nothing rather than an empty event.
 */
export function parseSseFrames(buffer) {
    // Normalize the three line endings the grammar allows before splitting, so a
    // frame boundary is always exactly "\n\n".
    const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const blocks = normalized.split("\n\n");
    const rest = blocks.pop() ?? "";
    const frames = [];
    for (const block of blocks) {
        const frame = parseFrameBlock(block);
        if (frame)
            frames.push(frame);
    }
    return { frames, rest };
}
/**
 * Parses one frame. Returns undefined when the block sets no field, which is
 * the case for a keepalive comment and for stray blank lines.
 */
function parseFrameBlock(block) {
    const dataLines = [];
    let event;
    let id;
    let retry;
    let sawField = false;
    for (const line of block.split("\n")) {
        if (line === "" || line.startsWith(":"))
            continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        // A single leading space after the colon is part of the delimiter.
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" "))
            value = value.slice(1);
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
                if (!value.includes("\0"))
                    id = value;
                sawField = true;
                break;
            case "retry": {
                const ms = Number(value);
                if (Number.isInteger(ms) && ms >= 0)
                    retry = ms;
                sawField = true;
                break;
            }
            default:
                // Unknown fields are ignored, per the grammar.
                break;
        }
    }
    if (!sawField)
        return undefined;
    return { event, data: dataLines.join("\n"), id, retry };
}
/**
 * Reads `body` to exhaustion and yields each complete frame.
 *
 * Aborting `signal` stops the read and ends the iteration; so does breaking out
 * of the `for await`, which cancels the underlying reader.
 */
export async function* readSseFrames(body, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const abort = () => void reader.cancel().catch(() => undefined);
    signal?.addEventListener("abort", abort);
    try {
        for (;;) {
            if (signal?.aborted)
                return;
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const { frames, rest } = parseSseFrames(buffer);
            buffer = rest;
            for (const frame of frames)
                yield frame;
        }
        // A server that closes without a trailing blank line still sent a frame.
        const tail = parseSseFrames(buffer + "\n\n");
        for (const frame of tail.frames)
            yield frame;
    }
    finally {
        signal?.removeEventListener("abort", abort);
        reader.releaseLock();
    }
}
