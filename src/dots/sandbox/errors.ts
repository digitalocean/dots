/**
 * Typed errors for the Sandbox SDK. Hand-written: `make generate` does not touch `src/dots/sandbox/`.
 *
 * Every failed API call surfaces as a {@link SandboxError} subclass chosen by
 * HTTP status, so callers branch with `instanceof`.
 */

import { HarnessRuntimeError, TimeoutError as HarnessTimeoutError } from "../harnessRuntime/errors.js";
import { HarnessStreamError } from "../streaming/harnessStream.js";

/** Any failed sandbox call. */
export class SandboxError extends Error {
    constructor(
        message: string,
        /** HTTP status, or 0 when the failure happened before a response. */
        readonly status: number = 0,
        /** Short stable error id from the API body, such as `not_found`. */
        readonly code?: string,
        /** `request_id` from the error body, for support. */
        readonly requestId?: string,
        /** `Retry-After` in seconds, when the server sent one. */
        readonly retryAfter?: number,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

/** No token, or 401. */
export class AuthenticationError extends SandboxError {}
/** 403: the token lacks the `sandbox:*` scope, or the feature is not enabled for the team. */
export class PermissionDeniedError extends SandboxError {}
/** 404: the sandbox or template does not exist, or belongs to another team. */
export class NotFoundError extends SandboxError {}
/** 400 or 422: the request was malformed, or the sandbox cannot take it in its current state. */
export class InvalidRequestError extends SandboxError {}
/** 409: the sandbox state conflicts with the request. */
export class ConflictError extends SandboxError {}
/** 429: see `retryAfter`. */
export class RateLimitError extends SandboxError {}
/** 5xx: the service failed. Usually worth retrying. */
export class ServiceError extends SandboxError {}
/** A wait ran out of time. The operation may still finish later. */
export class SandboxTimeoutError extends SandboxError {}
/** The object cannot do this: a PTY on an agent session, or a session operation on a bare sandbox. Raised before any request. */
export class UnsupportedError extends SandboxError {}
/** A command exited non-zero and the call asked to `check` it. `result` holds its output. */
export class CommandError<R = unknown> extends SandboxError {
    constructor(
        message: string,
        readonly result: R,
    ) {
        super(message);
    }
}

const BY_STATUS: Record<number, typeof SandboxError> = {
    400: InvalidRequestError,
    401: AuthenticationError,
    403: PermissionDeniedError,
    404: NotFoundError,
    409: ConflictError,
    422: InvalidRequestError,
    429: RateLimitError,
};

/** Builds the typed error for an HTTP status. */
export function errorForStatus(status: number, message: string, code?: string, requestId?: string, retryAfter?: number): SandboxError {
    const Type = BY_STATUS[status] ?? (status >= 500 ? ServiceError : SandboxError);
    return new Type(message, status, code, requestId, retryAfter);
}

/** Converts what the generated client throws into a typed error. Other errors pass through. */
export function toSandboxError(err: unknown): unknown {
    if (err instanceof SandboxError) return err;
    if (err instanceof HarnessStreamError) {
        const Type = BY_STATUS[err.status] ?? (err.status >= 500 ? ServiceError : SandboxError);
        return new Type(err.message, err.status, undefined, err.requestId, err.retryAfter);
    }
    const api = err as {
        responseStatusCode?: number;
        responseHeaders?: Record<string, string[]>;
        messageEscaped?: string | null;
        message?: string;
        id?: string | null;
        requestId?: string | null;
    };
    const status = api?.responseStatusCode;
    if (typeof status !== "number") return err;

    let retryAfter: number | undefined;
    for (const [k, v] of Object.entries(api.responseHeaders ?? {})) {
        if (k.toLowerCase() === "retry-after" && /^\d+$/.test(v[0] ?? "")) retryAfter = Number(v[0]);
    }
    const Type = BY_STATUS[status] ?? (status >= 500 ? ServiceError : SandboxError);
    const message = api.messageEscaped || api.message || `HTTP ${status}`;
    return new Type(message, status, api.id ?? undefined, api.requestId ?? undefined, retryAfter);
}

/** Runs a generated-client call and rethrows its failure as a typed error. */
export async function call<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (err) {
        throw toSandboxError(err);
    }
}

/** Maps a Harness Runtime error to the sandbox error of the same HTTP status, so one `catch` covers both APIs. */
export function fromHarnessError(err: unknown): unknown {
    if (err instanceof HarnessTimeoutError) return new SandboxTimeoutError(err.message);
    if (err instanceof HarnessRuntimeError) {
        if (err.status === 0) return new SandboxError(err.message);
        return errorForStatus(err.status, err.message, undefined, err.requestId, err.retryAfter);
    }
    return err;
}

/** Runs a Harness Runtime call and rethrows its failure as a sandbox error. */
export async function viaHarness<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (err) {
        throw fromHarnessError(err);
    }
}

/** Unwraps a field the API always returns, failing loudly if it did not. */
export function required<T>(value: T | null | undefined, what: string): T {
    if (value === null || value === undefined) {
        throw new SandboxError(`the API response did not include ${what}`);
    }
    return value;
}
