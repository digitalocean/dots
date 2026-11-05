/**
 * Environments, sessions and runs.
 *
 * Everything here calls an endpoint the Harness Runtime API already serves.
 * The generated client does the JSON calls; the streaming helpers do the event
 * stream and port-forward, which the generated client cannot.
 */

import { HttpMethod, RequestInformation, type RequestAdapter } from "@microsoft/kiota-abstractions";
import { HeadersInspectionOptions } from "@microsoft/kiota-http-fetchlibrary";
import type { DigitalOceanClient } from "../digitalOceanClient.js";
import {
    createDefinitions_create_session_responseFromDiscriminatorValue,
    Hitl_outcomeObject,
    Resolution_sourceObject,
    type Agent_config,
    type Checkpoint,
    type Definitions_create_session_response,
    type Definitions_session,
    type Hitl_outcome,
    type Workspace,
} from "../models/index.js";
import {
    SessionsRequestBuilderRequestsMetadata,
    SessionsRequestBuilderUriTemplate,
} from "../v2/agents/sessions/index.js";
import type { HarnessStreamOptions } from "../streaming/harnessStream.js";
import {
    collectSessionEvents,
    streamSessionEvents,
    type SessionEvent,
    type SessionEventReplay,
    type SessionEventStreamOptions,
} from "../streaming/sessionEvents.js";
import {
    openPortForward,
    type PortForwardTunnel,
    type WebSocketFactory,
} from "../streaming/portForward.js";
import {
    call,
    HarnessRuntimeError,
    required,
    SessionFailedError,
    TimeoutError,
    toHarnessError,
} from "./errors.js";

/** What every resource object needs to reach the API. */
export interface RuntimeContext {
    client: DigitalOceanClient;
    adapter: RequestAdapter;
    /** Auth, base URL and fetch for the hand-written streaming calls. */
    transport: HarnessStreamOptions;
    webSocketFactory?: WebSocketFactory;
    /** How often waits poll the API. */
    pollIntervalMs: number;
}

/** A manifest as YAML text, or as an object (sent as JSON, which is valid YAML). */
export type Manifest = string | Record<string, unknown>;

/** Serializes a manifest for the API. */
export function manifestText(manifest: Manifest): string {
    return typeof manifest === "string" ? manifest : JSON.stringify(manifest);
}

/** Pages through a list endpoint, so callers write `for await` instead of token loops. */
export async function* paginate<T>(
    fetchPage: (pageToken?: string) => Promise<{ items: T[]; nextPageToken?: string | null }>,
): AsyncGenerator<T> {
    let pageToken: string | undefined;
    do {
        const page = await fetchPage(pageToken);
        for (const item of page.items) yield item;
        pageToken = page.nextPageToken || undefined;
    } while (pageToken);
}

// ---------------------------------------------------------------- environments

/** A saved agent environment (an agent config): the manifest sessions are created from. */
export interface Environment {
    id: string;
    name: string;
    /** The full record as the API returned it. */
    raw: Agent_config;
}

function toEnvironment(config: Agent_config | null | undefined): Environment {
    const raw = required(config, "the environment");
    return { id: required(raw.id, "the environment id"), name: raw.name ?? "", raw };
}

/** Saved environments. They are immutable: create a new one to change the manifest. */
export class Environments {
    constructor(private readonly ctx: RuntimeContext) {}

    /** Saves a manifest under a team-unique name. */
    async create(input: { name: string; manifest: Manifest }): Promise<Environment> {
        const res = await call(() =>
            this.ctx.client.v2.agents.configs.post({
                name: input.name,
                manifestYaml: manifestText(input.manifest),
            }),
        );
        return toEnvironment(res?.config);
    }

    async get(id: string): Promise<Environment> {
        const res = await call(() => this.ctx.client.v2.agents.configs.byConfig_id(id).get());
        return toEnvironment(res?.config);
    }

    list(options: { search?: string } = {}): AsyncGenerator<Environment> {
        return paginate(async (pageToken) => {
            const res = await call(() =>
                this.ctx.client.v2.agents.configs.get({
                    queryParameters: { pageToken, search: options.search },
                }),
            );
            return { items: (res?.configs ?? []).map(toEnvironment), nextPageToken: res?.nextPageToken };
        });
    }

    async delete(id: string): Promise<void> {
        await call(() => this.ctx.client.v2.agents.configs.byConfig_id(id).delete());
    }
}

// ---------------------------------------------------------------- sessions

/** How to create a session. */
export type CreateSessionInput = {
    /** Session name, unique among the team's live sessions. */
    name?: string;
    /** Return as soon as the session is allocated, without waiting for it to be ready. */
    wait?: boolean;
    /** How long to wait for the session to become ready. Defaults to 10 minutes. */
    timeoutMs?: number;
} & (
    | {
          /** A saved environment, or its id. */
          environment: Environment | string;
          /** A persistent workspace to attach at `/workspace`, or its id. */
          workspace?: PersistentWorkspace | string;
      }
    | {
          /**
           * A manifest to create the session from directly. The API saves it as a
           * config for you. To attach a workspace, save the manifest with
           * `environments.create` and pass `environment` instead.
           */
          manifest: Manifest;
      }
);

/** Options for {@link Session.exec}. */
export interface ExecOptions {
    /** Working directory. Defaults to `/workspace`. */
    cwd?: string;
    /** Sent to the command's stdin in full, then closed. */
    stdin?: string | Uint8Array;
    /** How long the command may run. The server defaults to 60 s and allows at most 240 s. */
    timeoutMs?: number;
}

/** The result of {@link Session.exec}. */
export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    /** True when stdout or stderr passed 1 MiB and was cut off. */
    truncated: boolean;
    durationMs?: number;
}

/** A persistent workspace: a volume that outlives sessions and mounts at `/workspace`. */
export interface PersistentWorkspace {
    id: string;
    name: string;
    raw: Workspace;
}

const READY = new Set(["SESSION_STATUS_READY", "SESSION_STATUS_DETACHED"]);
const DEAD = new Set(["SESSION_STATUS_FAILED", "SESSION_STATUS_DESTROYING", "SESSION_STATUS_DESTROYED"]);

/** Creates, finds and lists sessions. */
export class Sessions {
    constructor(private readonly ctx: RuntimeContext) {}

    /**
     * Creates a session and, unless `wait` is false, returns once it is ready
     * (status READY or DETACHED). A session that fails instead raises
     * {@link SessionFailedError}.
     */
    async create(input: CreateSessionInput): Promise<Session> {
        let created: Definitions_session | null | undefined;
        if ("manifest" in input) {
            if ((input as { workspace?: unknown }).workspace !== undefined) {
                throw new HarnessRuntimeError(
                    "a workspace can only be attached to a session created from an environment: " +
                        "save the manifest with environments.create and pass `environment`",
                    0,
                );
            }
            created = await this.createFromManifest(input.manifest, input.name);
        } else {
            const configId = typeof input.environment === "string" ? input.environment : input.environment.id;
            const workspaceId = typeof input.workspace === "string" ? input.workspace : input.workspace?.id;
            const res = await call(() =>
                this.ctx.client.v2.agents.sessions.post({ configId, name: input.name, workspaceId }),
            );
            created = res?.session;
        }

        const session = new Session(this.ctx, required(created, "the session"));
        if (input.wait !== false) await session.waitUntilReady({ timeoutMs: input.timeoutMs });
        return session;
    }

    async get(id: string): Promise<Session> {
        const res = await call(() => this.ctx.client.v2.agents.sessions.bySession_id(id).get());
        return new Session(this.ctx, required(res?.session, "the session"));
    }

    list(options: { status?: string; search?: string } = {}): AsyncGenerator<Session> {
        return paginate(async (pageToken) => {
            const res = await call(() =>
                this.ctx.client.v2.agents.sessions.get({
                    queryParameters: {
                        pageToken,
                        search: options.search,
                        status: options.status as never,
                    },
                }),
            );
            return {
                items: (res?.sessions ?? []).map((s) => new Session(this.ctx, s)),
                nextPageToken: res?.nextPageToken,
            };
        });
    }

    /** The YAML form of create, which the generated client cannot send. */
    private async createFromManifest(manifest: Manifest, name?: string): Promise<Definitions_session | null | undefined> {
        const info = new RequestInformation(HttpMethod.POST, SessionsRequestBuilderUriTemplate);
        info.pathParameters.baseurl = this.ctx.adapter.baseUrl;
        if (name !== undefined) info.queryParameters.name = name;
        info.headers.tryAdd("Accept", "application/json");
        info.setStreamContent(toArrayBuffer(new TextEncoder().encode(manifestText(manifest))), "application/yaml");
        const res = await call(() =>
            this.ctx.adapter.send<Definitions_create_session_response>(
                info,
                createDefinitions_create_session_responseFromDiscriminatorValue,
                SessionsRequestBuilderRequestsMetadata.post?.errorMappings,
            ),
        );
        return res?.session;
    }
}

/** What a finished run produced. */
export interface RunResult {
    runId: string;
    status: "completed" | "failed";
    /** The agent's streamed text, joined. */
    text: string;
    /** Token and cost totals from `run.completed`. */
    usage?: { tokensIn: number; tokensOut: number; costMicros: number };
    /** Why the run failed, from `run.failed`. */
    error?: { code: number; message: string };
}

/** A request from the agent for a human decision, from `run.human_input_requested`. */
export interface ApprovalRequest {
    /** The HITL request id. */
    id: string;
    runId?: string;
    /** `permission`, `question` or `plan_approval`, when the agent classified it. */
    category?: string;
    /** The tool the agent wants to use, for agent kinds that report it. */
    toolName?: string;
    /** The agent's full request details. */
    details: Record<string, unknown>;
    approve(reason?: string): Promise<void>;
    reject(reason?: string): Promise<void>;
    defer(reason?: string): Promise<void>;
}

/** Options for {@link Session.run}. */
export interface RunOptions {
    /** Called with each piece of text as the agent streams it. */
    onText?: (text: string) => void;
    /** Called with every event of this run. */
    onEvent?: (event: SessionEvent) => void;
    /**
     * Called when the agent asks for approval. Decide by calling `approve`,
     * `reject` or `defer` on the request. Without this option the request stays
     * pending until something else resolves it.
     */
    onApproval?: (request: ApprovalRequest) => void | Promise<void>;
    /** Stops waiting. The run itself keeps going; use `cancel` to stop it. */
    signal?: AbortSignal;
}

/** How long `run` waits for the attach to confirm before sending anyway. */
const ATTACH_WAIT_MS = 5_000;

/** A Harness Runtime session. */
export class Session {
    /** Copy files in and out of the session's `/workspace` folder. */
    readonly files: SessionFiles;

    constructor(
        private readonly ctx: RuntimeContext,
        /** The session record as last read from the API. */
        public info: Definitions_session,
    ) {
        this.files = new SessionFiles(ctx, this.id);
    }

    get id(): string {
        return required(this.info.sessionId, "the session id");
    }

    get status(): string | undefined {
        return this.info.status ?? undefined;
    }

    private get item() {
        return this.ctx.client.v2.agents.sessions.bySession_id(this.id);
    }

    /** Reads the session again. */
    async refresh(): Promise<this> {
        const res = await call(() => this.item.get());
        this.info = required(res?.session, "the session");
        return this;
    }

    /** Polls until the session is READY or DETACHED. */
    async waitUntilReady(options: { timeoutMs?: number } = {}): Promise<this> {
        const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000);
        for (;;) {
            const status = this.info.status ?? "";
            if (READY.has(status)) return this;
            if (DEAD.has(status)) throw new SessionFailedError(this.id, status);
            if (Date.now() >= deadline) {
                throw new TimeoutError(`session ${this.id} was not ready in time (last status ${status})`);
            }
            await sleep(this.ctx.pollIntervalMs);
            await this.refresh();
        }
    }

    /** Sends a prompt and returns the run id, without waiting for the run. */
    async send(text: string): Promise<string> {
        const res = await call(() => this.item.input.post({ text }));
        return required(res?.runId, "the run id");
    }

    /**
     * Sends a prompt and follows that run to its end.
     *
     * The API has no run-status endpoint, so the end of a run is known only from
     * its `run.completed` or `run.failed` event. `run` attaches to the event
     * stream before sending, so the run's events cannot be missed, and the
     * stream reconnects on its own. If the stream cannot be recovered, `run`
     * raises an error rather than guess how the run ended.
     */
    async run(text: string, options: RunOptions = {}): Promise<RunResult> {
        const events = this.events({ signal: options.signal });
        try {
            // Attach first. The stream opens with a stream.state frame; once it has
            // arrived (or a short wait passes) the prompt goes out.
            const first = events.next();
            await settledOrTimeout(first, ATTACH_WAIT_MS);
            const runId = await this.send(text);

            let pending: Promise<IteratorResult<SessionEvent>> | undefined = first;
            let joined = "";
            for (;;) {
                const step: IteratorResult<SessionEvent> = await (pending ?? events.next());
                pending = undefined;
                if (step.done) {
                    throw new HarnessRuntimeError(`the event stream ended before run ${runId} finished`, 0);
                }
                const event = step.value;
                if (event.runId !== runId) continue;
                options.onEvent?.(event);
                const payload = (event.payload ?? {}) as Record<string, unknown>;

                switch (event.type) {
                    case "run.token_delta":
                        if (typeof payload.text === "string") {
                            joined += payload.text;
                            options.onText?.(payload.text);
                        }
                        break;
                    case "run.human_input_requested":
                        if (options.onApproval) await options.onApproval(this.approvalRequest(event, payload));
                        break;
                    case "run.completed":
                        return {
                            runId,
                            status: "completed",
                            text: joined,
                            usage: {
                                tokensIn: Number(payload.total_tokens_in ?? 0),
                                tokensOut: Number(payload.total_tokens_out ?? 0),
                                costMicros: Number(payload.run_cost_micros ?? 0),
                            },
                        };
                    case "run.failed":
                        return {
                            runId,
                            status: "failed",
                            text: joined,
                            error: { code: Number(payload.code ?? 0), message: String(payload.message ?? "") },
                        };
                }
            }
        } catch (err) {
            throw toHarnessError(err);
        } finally {
            await events.return(undefined);
        }
    }

    /**
     * The session's live events. Reconnects on its own and resumes after the
     * last event your loop body finished. Leave the loop to disconnect.
     */
    events(options: Omit<Partial<SessionEventStreamOptions>, "sessionId" | "replayOnly"> = {}): AsyncGenerator<SessionEvent> {
        return streamSessionEvents({ ...this.ctx.transport, ...options, sessionId: this.id });
    }

    /** A finished replay of recent events, and whether the server truncated it. */
    history(options: { from?: string } = {}): Promise<SessionEventReplay> {
        return collectSessionEvents({ ...this.ctx.transport, sessionId: this.id, replayFrom: options.from });
    }

    /** Resolves an approval request by its id. */
    async resolveApproval(id: string, outcome: "approve" | "reject" | "defer", reason?: string): Promise<void> {
        const outcomes: Record<typeof outcome, Hitl_outcome> = {
            approve: Hitl_outcomeObject.HITL_OUTCOME_APPROVE,
            reject: Hitl_outcomeObject.HITL_OUTCOME_REJECT,
            defer: Hitl_outcomeObject.HITL_OUTCOME_DEFER,
        };
        // The generated serializer always writes `source`, and the server keeps an
        // explicit UNSPECIFIED as is, so name the source the server would default to.
        await call(() =>
            this.item.hitl.byRequest_id(id).post({
                outcome: outcomes[outcome],
                reason,
                source: Resolution_sourceObject.RESOLUTION_SOURCE_OUT_OF_BAND,
            }),
        );
    }

    /** Takes a checkpoint of the session. */
    async checkpoint(options: { label?: string } = {}): Promise<Checkpoint & { checkpointId: string }> {
        const res = await call(() => this.item.checkpoints.post({ label: options.label }));
        const checkpoint = required(res?.checkpoint, "the checkpoint");
        return { ...checkpoint, checkpointId: required(checkpoint.checkpointId, "the checkpoint id") };
    }

    /** Lists the session's checkpoints. */
    checkpoints(): AsyncGenerator<Checkpoint> {
        return paginate(async (pageToken) => {
            const res = await call(() => this.item.checkpoints.get({ queryParameters: { pageToken } }));
            return { items: res?.checkpoints ?? [], nextPageToken: res?.nextPageToken };
        });
    }

    /**
     * Forks the session, from a checkpoint or from its current state, into
     * `count` new sessions, and waits until they are ready.
     */
    async fork(options: { from?: Checkpoint | string; count?: number; wait?: boolean } = {}): Promise<Session[]> {
        const from = typeof options.from === "string" ? options.from : options.from?.checkpointId ?? undefined;
        const res = await call(() => this.item.fork.post({ fromCheckpointId: from, count: options.count }));
        const forks = (res?.sessions ?? []).map((s) => new Session(this.ctx, s));
        if (options.wait !== false) await Promise.all(forks.map((f) => f.waitUntilReady()));
        return forks;
    }

    async pause(): Promise<void> {
        await call(() => this.item.pause.post());
    }

    async resume(): Promise<void> {
        await call(() => this.item.resume.post());
    }

    /** Cancels the current turn, or the given run. */
    async cancel(runId?: string): Promise<void> {
        await call(() => this.item.cancel.post({ runId }));
    }

    /** Destroys the session and its sandbox. A persistent workspace survives. */
    async destroy(): Promise<void> {
        await call(() => this.item.delete());
    }

    /**
     * Runs a command in the session's sandbox and returns its output once it
     * exits. A string runs through `sh -c`; an array runs as given, with no
     * shell. A non-zero exit is returned, not thrown.
     */
    async exec(command: string | string[], options: ExecOptions = {}): Promise<ExecResult> {
        const argv = typeof command === "string" ? ["sh", "-c", command] : command;
        const stdin = typeof options.stdin === "string" ? new TextEncoder().encode(options.stdin) : options.stdin;
        // Truncation is reported only in response headers.
        const headers = new HeadersInspectionOptions({ inspectResponseHeaders: true });
        const res = await call(() =>
            this.item.sandbox.exec.post(
                {
                    argv,
                    workdir: options.cwd,
                    stdin: stdin ? (stdin.slice().buffer as ArrayBuffer) : undefined,
                    timeoutSeconds: options.timeoutMs ? Math.ceil(options.timeoutMs / 1000) : undefined,
                },
                { options: [headers] },
            ),
        );
        const flagged = (name: string) => headers.getResponseHeaders().get(name)?.has("true") ?? false;
        return {
            exitCode: required(res?.exitCode, "the exit code"),
            stdout: res?.stdout ?? "",
            stderr: res?.stderr ?? "",
            truncated: flagged("X-Exec-Stdout-Truncated") || flagged("X-Exec-Stderr-Truncated"),
            durationMs: res?.durationMs ?? undefined,
        };
    }

    /**
     * Opens a tunnel to a port inside the session's sandbox. Under Node, pass
     * `webSocketFactory` to the client (for example over the `ws` package),
     * because the platform WebSocket cannot send the Authorization header.
     */
    async portForward(port: number, onData: (bytes: Uint8Array) => void): Promise<PortForwardTunnel> {
        try {
            return await openPortForward({
                ...this.ctx.transport,
                sessionId: this.id,
                port,
                onData,
                webSocketFactory: this.ctx.webSocketFactory,
            });
        } catch (err) {
            throw toHarnessError(err);
        }
    }

    private approvalRequest(event: SessionEvent, payload: Record<string, unknown>): ApprovalRequest {
        const id = String(payload.hitl_id ?? "");
        const details = (payload.payload ?? {}) as Record<string, unknown>;
        return {
            id,
            runId: event.runId,
            category: typeof details.category === "string" ? details.category : undefined,
            toolName: typeof details.tool_name === "string" ? details.tool_name : undefined,
            details,
            approve: (reason) => this.resolveApproval(id, "approve", reason),
            reject: (reason) => this.resolveApproval(id, "reject", reason),
            defer: (reason) => this.resolveApproval(id, "defer", reason),
        };
    }
}

// ---------------------------------------------------------------- files

/** Fixed footer the server appends to a download: "DOWSSHA1" + 64 hex + "\n". */
const FOOTER_BYTES = 73;
const FOOTER = /^DOWSSHA1([0-9a-f]{64})\n$/;

/**
 * File transfer for a session's `/workspace` folder. When the session has a
 * persistent workspace attached, that folder is the workspace, so files written
 * here outlive the session. Each transfer is capped at 50 MiB by the sandbox.
 */
export class SessionFiles {
    constructor(
        private readonly ctx: RuntimeContext,
        private readonly sessionId: string,
    ) {}

    private get item() {
        return this.ctx.client.v2.agents.sessions.bySession_id(this.sessionId).workspace;
    }

    /** Writes `data` to `path` (relative to `/workspace`). */
    async upload(path: string, data: Uint8Array | ArrayBuffer | string, options: { archive?: boolean } = {}): Promise<void> {
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        const body = bytes instanceof Uint8Array ? toArrayBuffer(bytes) : bytes;
        await call(() => this.item.upload.post(body, { queryParameters: { path, isArchive: options.archive } }));
    }

    /**
     * Reads `path` (relative to `/workspace`). The server appends a checksum
     * footer to every download; this strips it and verifies the bytes against
     * it, raising an error for a truncated or corrupted transfer.
     */
    async download(path: string, options: { archive?: boolean } = {}): Promise<Uint8Array> {
        const res = await call(() =>
            this.item.download.get({ queryParameters: { path, asArchive: options.archive } }),
        );
        return verifyDownload(new Uint8Array(required(res, "the download body")));
    }

    /** Reads `path` as UTF-8 text. */
    async downloadText(path: string): Promise<string> {
        return new TextDecoder().decode(await this.download(path));
    }
}

/** Strips and checks the download footer. Exported for tests. */
export async function verifyDownload(body: Uint8Array): Promise<Uint8Array> {
    if (body.length < FOOTER_BYTES) {
        throw new HarnessRuntimeError("the download is truncated: its checksum footer is missing", 0);
    }
    const payload = body.subarray(0, body.length - FOOTER_BYTES);
    const footer = new TextDecoder().decode(body.subarray(body.length - FOOTER_BYTES));
    const match = FOOTER.exec(footer);
    if (!match) {
        throw new HarnessRuntimeError("the download is truncated: its checksum footer is missing", 0);
    }
    const digest = await sha256Hex(payload);
    if (digest !== match[1]) {
        throw new HarnessRuntimeError("the download is corrupted: its checksum does not match", 0);
    }
    return payload;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for `promise` to settle or `ms` to pass, and rethrows its rejection. */
async function settledOrTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
    });
    try {
        await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}
