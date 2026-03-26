/**
 * Streaming utility functions for DoTs
 */
import { StreamingRequestAdapter, StreamingResponseType, } from "./StreamingRequestAdapter.js";
/**
 * Collect all streaming data into an array
 */
export async function collectStream(streamingAdapter, requestInfo, options = {}) {
    const results = [];
    const errors = [];
    await streamingAdapter.stream(requestInfo, {
        onData: (chunk) => {
            const data = options.factory ? options.factory(chunk) : chunk;
            results.push(data);
        },
        onError: (error) => errors.push(error),
    }, options);
    if (errors.length > 0) {
        const errorMessages = errors.map((e) => e.message).join("; ");
        throw new Error(`Streaming errors: ${errorMessages}`);
    }
    return results;
}
/**
 * Create a streaming adapter from a request adapter
 */
export function createStreamingAdapter(underlyingAdapter, authenticationProvider) {
    return new StreamingRequestAdapter(underlyingAdapter, authenticationProvider);
}
/**
 * Stream data with custom handler
 */
export async function streamWithHandler(streamingAdapter, requestInfo, handler, options) {
    return new Promise((resolve, reject) => {
        streamingAdapter.stream(requestInfo, {
            onData: async (data) => {
                try {
                    const processed = options?.factory ? options.factory(data) : data;
                    await handler(processed);
                }
                catch (error) {
                    reject(error);
                }
            },
            onError: reject,
            onComplete: resolve,
        }, options).catch(reject);
    });
}
export { StreamingRequestAdapter, StreamingResponseType };
