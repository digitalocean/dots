/**
 * `@digitalocean/dots/sandbox`: DigitalOcean Sandboxes on `/v2/sandboxes`.
 * Hand-written. `make generate` does not touch this folder.
 */
export { SandboxClient } from "./client.js";
export type { ClientOptions } from "./config.js";
export {
    AuthenticationError,
    ConflictError,
    InvalidRequestError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
    SandboxError,
    SandboxTimeoutError,
    ServiceError,
} from "./errors.js";
export {
    DEFAULT_SIZE,
    Sandbox,
    SandboxPaginator,
    type SandboxCreateOptions,
    type SandboxListOptions,
    type WaitOptions,
} from "./sandbox.js";
export type { SandboxInfo, SandboxState } from "./types.js";
export { Sandbox as default } from "./sandbox.js";
