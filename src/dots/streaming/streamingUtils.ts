/**
 * Streaming utility functions for DoTs
 */

import {
    StreamingRequestAdapter,
    StreamingResponseType,
    type StreamingResponseCallbacks,
    type StreamingRequestOptions,
} from "./StreamingRequestAdapter.js";
import type { RequestAdapter } from "@microsoft/kiota-abstractions";
import type { RequestInformation } from "@microsoft/kiota-abstractions";

/**
 * Helper type for streaming options with factory function
 */
export interface StreamingOptions<T> extends StreamingRequestOptions {
    factory?: (data: unknown) => T;
}

/**
 * Collect all streaming data into an array
 */
export async function collectStream<T = unknown>(
    streamingAdapter: StreamingRequestAdapter,
    requestInfo: RequestInformation,
    options: StreamingOptions<T> = {}
): Promise<T[]> {
    const results: T[] = [];
    const errors: Error[] = [];

    await streamingAdapter.stream<T>(
        requestInfo,
        {
            onData: (chunk) => {
                const data = options.factory ? options.factory(chunk) : chunk;
                results.push(data as T);
            },
            onError: (error) => errors.push(error),
        },
        options
    );

    if (errors.length > 0) {
        const errorMessages = errors.map((e) => e.message).join("; ");
        throw new Error(`Streaming errors: ${errorMessages}`);
    }

    return results;
}

/**
 * Create a streaming adapter from a request adapter
 */
export function createStreamingAdapter(
    underlyingAdapter: RequestAdapter
): StreamingRequestAdapter {
    return new StreamingRequestAdapter(underlyingAdapter);
}

/**
 * Stream data with custom handler
 */
export async function streamWithHandler<T>(
    streamingAdapter: StreamingRequestAdapter,
    requestInfo: RequestInformation,
    handler: (data: T) => Promise<void> | void,
    options?: StreamingOptions<T>
): Promise<void> {
    return new Promise((resolve, reject) => {
        streamingAdapter.stream<T>(
            requestInfo,
            {
                onData: async (data) => {
                    try {
                        const processed = options?.factory ? options.factory(data) : data;
                        await handler(processed as T);
                    } catch (error) {
                        reject(error);
                    }
                },
                onError: reject,
                onComplete: resolve,
            },
            options
        ).catch(reject);
    });
}

export { StreamingRequestAdapter, StreamingResponseType };
export type { StreamingResponseCallbacks, StreamingRequestOptions };
