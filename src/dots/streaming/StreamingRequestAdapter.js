/**
 * Supported streaming response types
 */
export var StreamingResponseType;
(function (StreamingResponseType) {
    /** Server-Sent Events format */
    StreamingResponseType["TEXT_EVENT_STREAM"] = "text/event-stream";
    /** NDJSON format (newline-delimited JSON) */
    StreamingResponseType["APPLICATION_NDJSON"] = "application/x-ndjson";
    /** Plain text format */
    StreamingResponseType["TEXT_PLAIN"] = "text/plain";
})(StreamingResponseType || (StreamingResponseType = {}));
/**
 * Adapter that wraps a request adapter to add streaming capabilities
 * Supports SSE, NDJSON, and plain text streaming
 */
export class StreamingRequestAdapter {
    /**
     * Creates a new StreamingRequestAdapter
     * @param underlyingAdapter The underlying RequestAdapter to wrap
     */
    constructor(underlyingAdapter, authenticationProvider) {
        this.underlyingAdapter = underlyingAdapter;
        this.authenticationProvider = authenticationProvider;
        if (!underlyingAdapter) {
            throw new Error("underlyingAdapter cannot be null");
        }
    }
    /**
     * Stream data from an endpoint
     * @param requestInfo The request information
     * @param callbacks Callbacks for stream lifecycle
     * @param options Streaming options
     */
    async stream(requestInfo, callbacks, options) {
        try {
            const streamType = options?.streamType || StreamingResponseType.TEXT_EVENT_STREAM;
            if (this.authenticationProvider) {
                await this.authenticationProvider.authenticateRequest(requestInfo);
            }
            // Build headers - flatten Set values to strings
            const headers = {};
            if (requestInfo.headers) {
                for (const [key, values] of requestInfo.headers.entries()) {
                    headers[key] = Array.from(values).join(", ");
                }
            }
            const response = await fetch(requestInfo.URL ?? "", {
                method: requestInfo.httpMethod?.toString() || "GET",
                headers,
                body: requestInfo.content ?? undefined,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            if (!response.body) {
                throw new Error("Response body is null");
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    if (streamType === StreamingResponseType.TEXT_EVENT_STREAM) {
                        buffer = this.processSSE(buffer, callbacks, options);
                    }
                    else if (streamType === StreamingResponseType.APPLICATION_NDJSON) {
                        buffer = this.processNDJSON(buffer, callbacks, options);
                    }
                    else if (streamType === StreamingResponseType.TEXT_PLAIN) {
                        buffer = this.processPlainText(buffer, callbacks, options);
                    }
                }
                // Flush any remaining data
                if (buffer.trim()) {
                    if (streamType === StreamingResponseType.TEXT_EVENT_STREAM) {
                        this.processSSE(buffer, callbacks, options);
                    }
                    else if (streamType === StreamingResponseType.APPLICATION_NDJSON) {
                        this.processNDJSON(buffer, callbacks, options);
                    }
                    else {
                        this.emitData(buffer.trim(), callbacks, options);
                    }
                }
                callbacks.onComplete?.();
            }
            finally {
                reader.releaseLock();
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            callbacks.onError?.(err);
            throw err;
        }
    }
    /**
     * Process Server-Sent Events format
     */
    processSSE(buffer, callbacks, options) {
        const events = buffer.split("\n\n");
        for (let i = 0; i < events.length - 1; i++) {
            const event = events[i];
            if (!event.trim())
                continue;
            const lines = event.split("\n");
            for (const line of lines) {
                if (line.startsWith("data:")) {
                    const data = line.substring(5).trim();
                    this.emitData(data, callbacks, options);
                }
            }
        }
        return events[events.length - 1];
    }
    /**
     * Process NDJSON (newline-delimited JSON) format
     */
    processNDJSON(buffer, callbacks, options) {
        const lines = buffer.split("\n");
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.trim()) {
                this.emitData(line, callbacks, options);
            }
        }
        return lines[lines.length - 1];
    }
    /**
     * Process plain text format
     */
    processPlainText(buffer, callbacks, options) {
        // For plain text, emit lines as they come
        const lines = buffer.split("\n");
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.trim()) {
                this.emitData(line.trim(), callbacks, options);
            }
        }
        return lines[lines.length - 1];
    }
    /**
     * Emit data to the callback
     */
    emitData(data, callbacks, options) {
        try {
            let parsed;
            if (options?.parseJsonLines !== false) {
                try {
                    parsed = JSON.parse(data);
                }
                catch {
                    parsed = data;
                }
            }
            else {
                parsed = data;
            }
            callbacks.onData?.(parsed);
        }
        catch {
            // Continue on parse errors
        }
    }
}
