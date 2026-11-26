/**
 * `@digitalocean/dots/sandbox`: DigitalOcean Sandboxes on `/v2/sandboxes`.
 * Hand-written. `make generate` does not touch this folder.
 */
export { AgentHandle, AgentSandbox } from "./agentSandbox.js";
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
export {
    Files,
    type FileData,
    type FileEntry,
    type FileEntryType,
    type FileListOptions,
    type FileTransferOptions,
    type FileWriteResult,
    type MakeDirResult,
} from "./files.js";
export {
    Exec,
    ExecSession,
    type ExecCallable,
    type ExecCallOptions,
    type ExecCommand,
    type ExecDuration,
    type ExecEvent,
    type ExecPtyOptions,
    type ExecResult,
    type ExecRunOptions,
    type ExecStartOptions,
    type ExecWaitOptions,
} from "./exec.js";
export type { ClientOptions } from "./config.js";
export {
    AuthenticationError,
    ConflictError,
    InvalidRequestError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
    SandboxError,
    CommandError,
    SandboxTimeoutError,
    ServiceError,
    UnsupportedError,
} from "./errors.js";
export {
    Agent,
    DEFAULT_SIZE,
    DEFAULT_TEMPLATE,
    Sandbox,
    SandboxPaginator,
    type AgentOptions,
    type AgentSandboxCreateOptions,
    type SandboxCreateOptions,
    type SandboxGetOptions,
    type SandboxKind,
    type SandboxListOptions,
    type SessionGetOptions,
    type SessionListOptions,
    type WaitOptions,
} from "./sandbox.js";
export type { SandboxInfo, SandboxState } from "./types.js";
export { Sandbox as default } from "./sandbox.js";
