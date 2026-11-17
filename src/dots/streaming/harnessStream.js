/**
 * Shared plumbing for the Harness Runtime streaming helpers.
 *
 * Every URL here is expanded from a URI template the generator exports, so a
 * path or query parameter that changes in the OpenAPI spec reaches these
 * helpers on the next regeneration instead of drifting silently.
 */
import { HttpMethod, RequestInformation, } from "@microsoft/kiota-abstractions";
/** The host the generated client defaults to. */
export const DEFAULT_BASE_URL = "https://api.digitalocean.com";
/**
 * An error response from the API, carrying the parts of the DO error envelope
 * a caller can act on.
 */
export class HarnessStreamError extends Error {
    constructor(message, 
    /** HTTP status of the response. */
    status, 
    /** `request_id` from the error envelope, for support. */
    requestId, 
    /**
     * `Retry-After` in seconds when the server sent one. Exec streaming
     * answers 429 with this header when a replica has no free stream slot.
     */
    retryAfter) {
        super(message);
        this.status = status;
        this.requestId = requestId;
        this.retryAfter = retryAfter;
        this.name = "HarnessStreamError";
    }
}
/**
 * Expands `urlTemplate` and collects the headers the auth provider adds.
 *
 * `RequestInformation` does the expansion, which is the same code path the
 * generated request builders take, so query parameters are encoded identically.
 */
export async function prepareRequest(method, urlTemplate, pathParameters, queryParameters, options, extraHeaders = {}) {
    const info = new RequestInformation(method);
    info.urlTemplate = urlTemplate;
    info.pathParameters = {
        baseurl: options.baseUrl ?? DEFAULT_BASE_URL,
        ...pathParameters,
    };
    // Drop unset values so an absent option does not become "undefined" in the
    // query string.
    for (const [key, value] of Object.entries(queryParameters)) {
        if (value !== undefined && value !== null)
            info.queryParameters[key] = value;
    }
    await options.authProvider.authenticateRequest(info);
    const headers = {};
    for (const [key, values] of info.headers.entries()) {
        headers[key] = Array.from(values).join(", ");
    }
    return { url: info.URL, headers: { ...headers, ...extraHeaders } };
}
/**
 * Performs the request and returns the response once it is streaming.
 *
 * A non-2xx is raised as {@link HarnessStreamError} with the envelope's message
 * when the body carries one. These endpoints answer their pre-stream failures
 * as JSON, not as an SSE error frame, so this runs before any frame is read.
 */
export async function openStream(request, init, options) {
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch(request.url, {
        ...init,
        headers: request.headers,
        signal: options.signal,
    });
    if (!response.ok)
        throw await toStreamError(response);
    if (!response.body) {
        throw new HarnessStreamError("response body is empty", response.status);
    }
    return response;
}
/** Reads the DO error envelope off a failed response. */
async function toStreamError(response) {
    let message = `HTTP ${response.status}: ${response.statusText}`;
    let requestId;
    const body = await response.text().catch(() => "");
    if (body) {
        try {
            const envelope = JSON.parse(body);
            if (envelope.message)
                message = envelope.message;
            requestId = envelope.request_id;
        }
        catch {
            message = `${message} — ${body}`;
        }
    }
    const header = response.headers.get("Retry-After");
    const retryAfter = header !== null && /^\d+$/.test(header) ? Number(header) : undefined;
    return new HarnessStreamError(message, response.status, requestId, retryAfter);
}
export { HttpMethod };
