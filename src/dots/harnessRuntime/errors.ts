/**
 * Typed errors for the Harness Runtime SDK.
 *
 * Every failed API call surfaces as a {@link HarnessRuntimeError} subclass
 * chosen by HTTP status, so callers can branch with `instanceof` instead of
 * reading status codes out of the generated client's error objects.
 */

import { HarnessStreamError } from "../streaming/harnessStream.js";

/** Any failed Harness Runtime call. */
export class HarnessRuntimeError extends Error {
    constructor(
        message: string,
        /** HTTP status, or 0 when the failure happened before a response. */
        readonly status: number,
        /** `request_id` from the error envelope, for support. */
        readonly requestId?: string,
        /** `Retry-After` in seconds, when the server sent one. */
        readonly retryAfter?: number,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

/** 400: the request was malformed or failed validation. */
export class InvalidRequestError extends HarnessRuntimeError {}
/** 401: the token is missing or invalid. */
export class UnauthorizedError extends HarnessRuntimeError {}
/** 402: the team has no balance or credit left for this. */
export class PaymentRequiredError extends HarnessRuntimeError {}
/** 403: the feature is not enabled for this team, or the token lacks access. */
export class NotEnabledError extends HarnessRuntimeError {}
/** 404: the resource does not exist, or belongs to another team. */
export class NotFoundError extends HarnessRuntimeError {}
/** 409: the resource is in a state that does not allow this, or the name is taken. */
export class ConflictError extends HarnessRuntimeError {}
/** 423: the session is locked. */
export class LockedError extends HarnessRuntimeError {}
/** 429: too many requests. See `retryAfter`. */
export class RateLimitError extends HarnessRuntimeError {}
/** 5xx: the service failed. Usually worth retrying. */
export class ServiceError extends HarnessRuntimeError {}

/** A session reached a state it cannot become ready from. */
export class SessionFailedError extends HarnessRuntimeError {
    constructor(
        readonly sessionId: string,
        /** The session status that ended the wait, such as `SESSION_STATUS_FAILED`. */
        readonly sessionStatus: string,
    ) {
        super(`session ${sessionId} did not become ready: ${sessionStatus}`, 0);
    }
}

/** A wait ran out of time. The operation itself may still finish later. */
export class TimeoutError extends HarnessRuntimeError {
    constructor(message: string) {
        super(message, 0);
    }
}

const BY_STATUS: Record<number, new (m: string, s: number, r?: string, a?: number) => HarnessRuntimeError> = {
    400: InvalidRequestError,
    401: UnauthorizedError,
    402: PaymentRequiredError,
    403: NotEnabledError,
    404: NotFoundError,
    409: ConflictError,
    423: LockedError,
    429: RateLimitError,
};

/** Builds the typed error for a status. */
export function errorForStatus(
    message: string,
    status: number,
    requestId?: string,
    retryAfter?: number,
): HarnessRuntimeError {
    const Type = BY_STATUS[status] ?? (status >= 500 ? ServiceError : HarnessRuntimeError);
    return new Type(message, status, requestId, retryAfter);
}

/**
 * Converts what the generated client or the streaming helpers throw into a
 * typed error. Anything else (a programming error, an abort) is returned as is.
 */
export function toHarnessError(err: unknown): unknown {
    if (err instanceof HarnessRuntimeError) return err;
    if (err instanceof HarnessStreamError) {
        return errorForStatus(err.message, err.status, err.requestId, err.retryAfter);
    }
    const api = err as {
        responseStatusCode?: number;
        responseHeaders?: Record<string, string[]>;
        messageEscaped?: string | null;
        message?: string;
        requestId?: string | null;
    };
    if (typeof api?.responseStatusCode !== "number") return err;

    const header = headerValue(api.responseHeaders, "retry-after");
    const retryAfter = header !== undefined && /^\d+$/.test(header) ? Number(header) : undefined;
    const message = api.messageEscaped || api.message || `HTTP ${api.responseStatusCode}`;
    return errorForStatus(message, api.responseStatusCode, api.requestId ?? undefined, retryAfter);
}

/** Runs a generated-client call and rethrows its failure as a typed error. */
export async function call<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (err) {
        throw toHarnessError(err);
    }
}

/** Unwraps a field the API always returns, failing loudly if it did not. */
export function required<T>(value: T | null | undefined, what: string): T {
    if (value === null || value === undefined) {
        throw new HarnessRuntimeError(`the API response did not include ${what}`, 0);
    }
    return value;
}

function headerValue(headers: Record<string, string[]> | undefined, name: string): string | undefined {
    if (!headers) return undefined;
    for (const [key, values] of Object.entries(headers)) {
        if (key.toLowerCase() === name) return values[0];
    }
    return undefined;
}
