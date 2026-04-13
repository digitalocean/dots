import {
    RequestAdapter,
    RequestInformation,
} from "@microsoft/kiota-abstractions";
import type { Parsable, ParsableFactory } from "@microsoft/kiota-abstractions";

type AdapterWithOptionalAuth = RequestAdapter & {
    authenticationProvider?: {
        authenticateRequest: (
            request: RequestInformation,
            additionalAuthenticationContextProvider?: Record<string, unknown>
        ) => Promise<void>;
    };
};

/**
 * Supported streaming response types
 */
export enum StreamingResponseType {
    /** Server-Sent Events format */
    TEXT_EVENT_STREAM = "text/event-stream",
    /** NDJSON format (newline-delimited JSON) */
    APPLICATION_NDJSON = "application/x-ndjson",
    /** Plain text format */
    TEXT_PLAIN = "text/plain",
}

/**
 * Callbacks for streaming responses
 */
export interface StreamingResponseCallbacks<T = unknown> {
    onData?: (data: T) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

/**
 * Options for streaming requests
 */
export interface StreamingRequestOptions {
    /** Type of streaming response format */
    streamType?: StreamingResponseType;
    /** Whether to parse as JSON lines */
    parseJsonLines?: boolean;
    /** Factory function to create typed messages */
    messageFactory?: ParsableFactory<Parsable>;
}

/**
 * Adapter that wraps a request adapter to add streaming capabilities
 * Supports SSE, NDJSON, and plain text streaming
 */
export class StreamingRequestAdapter {
    /**
     * Creates a new StreamingRequestAdapter
     * @param underlyingAdapter The underlying RequestAdapter to wrap
     */
    constructor(private readonly underlyingAdapter: RequestAdapter) {
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
    async stream<T = unknown>(
        requestInfo: RequestInformation,
        callbacks: StreamingResponseCallbacks<T>,
        options?: StreamingRequestOptions
    ): Promise<void> {
        try {
            const streamType = options?.streamType || StreamingResponseType.TEXT_EVENT_STREAM;
            const adapterWithAuth = this.underlyingAdapter as AdapterWithOptionalAuth;

            // Ensure auth headers are present for direct fetch streaming.
            if (adapterWithAuth.authenticationProvider?.authenticateRequest) {
                await adapterWithAuth.authenticationProvider.authenticateRequest(
                    requestInfo
                );
            }

            requestInfo.headers.tryAdd("Accept", streamType);
            let response: Response;

            try {
                // Let the adapter build an authenticated native request (headers + body).
                const nativeRequest =
                    await this.underlyingAdapter.convertToNativeRequest<Request>(requestInfo);
                response = await fetch(nativeRequest);
            } catch {
                // Fallback path in case a non-fetch adapter is used.
                const headers: Record<string, string> = {};
                if (requestInfo.headers) {
                    for (const [key, values] of requestInfo.headers.entries()) {
                        headers[key] = Array.from(values).join(", ");
                    }
                }
                response = await fetch(requestInfo.URL ?? "", {
                    method: requestInfo.httpMethod?.toString() || "GET",
                    headers,
                    body: requestInfo.content,
                });
            }

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`
                );
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

                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    if (streamType === StreamingResponseType.TEXT_EVENT_STREAM) {
                        buffer = this.processSSE(buffer, callbacks, options);
                    } else if (
                        streamType === StreamingResponseType.APPLICATION_NDJSON
                    ) {
                        buffer = this.processNDJSON(buffer, callbacks, options);
                    } else if (streamType === StreamingResponseType.TEXT_PLAIN) {
                        buffer = this.processPlainText(buffer, callbacks, options);
                    }
                }

                // Flush any remaining data
                if (buffer.trim()) {
                    if (streamType === StreamingResponseType.TEXT_EVENT_STREAM) {
                        this.processSSE(buffer, callbacks, options);
                    } else if (
                        streamType === StreamingResponseType.APPLICATION_NDJSON
                    ) {
                        this.processNDJSON(buffer, callbacks, options);
                    } else {
                        this.emitData(buffer.trim(), callbacks, options);
                    }
                }

                callbacks.onComplete?.();
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            callbacks.onError?.(err);
            throw err;
        }
    }

    /**
     * Process Server-Sent Events format
     */
    private processSSE<T = unknown>(
        buffer: string,
        callbacks: StreamingResponseCallbacks<T>,
        options?: StreamingRequestOptions
    ): string {
        const events = buffer.split("\n\n");

        for (let i = 0; i < events.length - 1; i++) {
            const event = events[i];
            if (!event.trim()) continue;

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
    private processNDJSON<T = unknown>(
        buffer: string,
        callbacks: StreamingResponseCallbacks<T>,
        options?: StreamingRequestOptions
    ): string {
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
    private processPlainText<T = unknown>(
        buffer: string,
        callbacks: StreamingResponseCallbacks<T>,
        options?: StreamingRequestOptions
    ): string {
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
    private emitData<T = unknown>(
        data: string,
        callbacks: StreamingResponseCallbacks<T>,
        options?: StreamingRequestOptions
    ): void {
        try {
            let parsed: T;

            if (options?.parseJsonLines !== false) {
                try {
                    parsed = JSON.parse(data) as T;
                } catch {
                    parsed = data as T;
                }
            } else {
                parsed = data as T;
            }

            callbacks.onData?.(parsed);
        } catch {
            // Continue on parse errors
        }
    }
}
