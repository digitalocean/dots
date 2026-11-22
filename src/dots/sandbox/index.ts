/**
 * `@digitalocean/dots/sandbox`: DigitalOcean Sandboxes on `/v2/sandboxes`.
 * Hand-written. `make generate` does not touch this folder.
 */
export { SandboxClient } from "./client.js";
export { Pages } from "./pages.js";
export {
    Snapshot,
    type SnapshotCreateOptions,
    type SnapshotInfo,
    type SnapshotListOptions,
    type SnapshotState,
    type SnapshotWaitOptions,
} from "./snapshots.js";
export {
    Template,
    type ImageSource,
    type TemplateBuildInfo,
    type TemplateBuildStatus,
    type TemplateCreateOptions,
    type TemplateInfo,
    type TemplateListOptions,
    type TemplateStatus,
    type TemplateUpdateOptions,
    type TemplateWaitOptions,
} from "./templates.js";
export {
    Command,
    Commands,
    type CommandAttachOptions,
    type CommandEvent,
    type CommandInfo,
    type CommandResult,
    type CommandRunOptions,
    type CommandSignal,
    type CommandStartOptions,
} from "./commands.js";
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
    DEFAULT_TEMPLATE,
    Sandbox,
    SandboxPaginator,
    type SandboxCreateOptions,
    type SandboxListOptions,
    type WaitOptions,
} from "./sandbox.js";
export type { SandboxInfo, SandboxState } from "./types.js";
export { Sandbox as default } from "./sandbox.js";
