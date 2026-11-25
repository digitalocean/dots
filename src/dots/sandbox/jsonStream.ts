/**
 * Readers for the streaming endpoints (`/commands/{pid}/stream`, `/exec`).
 *
 * These answer `application/json` with the grpc-gateway envelope: one JSON
 * object per event, each `{"result": ...}` or `{"error": ...}`, usually
 * newline-delimited. Hand-written.
 */

/**
 * Splits a stream of concatenated JSON objects (newline-delimited or not) into
 * parsed objects, keeping a partial object for the next chunk. Braces inside
 * strings do not count, and text between objects (such as an SSE `data: `
 * prefix) is skipped.
 */
export class JsonObjectReader {
    private buf = "";

    push(text: string): unknown[] {
        this.buf += text;
        const out: unknown[] = [];
        let depth = 0;
        let inString = false;
        let escaped = false;
        let start = -1;
        let consumed = 0;
        for (let i = 0; i < this.buf.length; i++) {
            const ch = this.buf[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === "\\") escaped = true;
                else if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') inString = true;
            else if (ch === "{") {
                if (depth === 0) start = i;
                depth++;
            } else if (ch === "}" && depth > 0) {
                depth--;
                if (depth === 0) {
                    out.push(JSON.parse(this.buf.slice(start, i + 1)));
                    consumed = i + 1;
                }
            }
        }
        this.buf = depth === 0 ? "" : this.buf.slice(start >= 0 ? start : consumed);
        return out;
    }
}

/**
 * Yields each JSON object of a streaming body as it arrives. Ends quietly when
 * `signal` aborts the read. The body is cancelled when the iteration ends.
 */
export async function* readJsonObjects(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<unknown> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const objects = new JsonObjectReader();
    try {
        for (;;) {
            let chunk: Awaited<ReturnType<typeof reader.read>>;
            try {
                chunk = await reader.read();
            } catch (err) {
                if (signal?.aborted) return;
                throw err;
            }
            if (chunk.done) break;
            yield* objects.push(decoder.decode(chunk.value, { stream: true }));
        }
    } finally {
        await reader.cancel().catch(() => undefined);
    }
}
