/**
 * Environments, sessions and runs.
 *
 * Everything here calls an endpoint the Harness Runtime API already serves.
 * The generated client does the JSON calls; the streaming helpers do the event
 * stream and port-forward, which the generated client cannot.
 */

import { HttpMethod, RequestInformation, type RequestAdapter } from "@microsoft/kiota-abstractions";
import type { DigitalOceanClient } from "../digitalOceanClient.js";
import {
    createAgent_config_responseFromDiscriminatorValue,
    createDefinitions_create_session_responseFromDiscriminatorValue,
    Hitl_outcomeObject,
    Resolution_sourceObject,
    type Agent_config,
    type Agent_config_response,
    type Checkpoint,
    type Definitions_create_session_response,
    type Definitions_session,
    type Hitl_outcome,
    type Workspace,
} from "../models/index.js";
import { SessionsRequestBuilderRequestsMetadata } from "../v2/agents/sessions/index.js";
import {
    ConfigsRequestBuilderRequestsMetadata,
    ConfigsRequestBuilderUriTemplate,
} from "../v2/agents/configs/index.js";
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
    ConflictError,
    HarnessRuntimeError,
    NotFoundError,
    required,
    SessionFailedError,
    TimeoutError,
    toHarnessError,
} from "./errors.js";
import {
    execBuffered,
    execStreamed,
    spawn,
    type ExecOptions,
    type ExecProcess,
    type ExecResult,
    type SpawnOptions,
} from "./exec.js";
import { SessionFiles, toArrayBuffer } from "./files.js";

/** The YAML session create, with the managed-key flag the generated template lacks. */
const CREATE_SESSION_URI_TEMPLATE = "{+baseurl}/v2/agents/sessions{?name*,manage_model_access_key*}";

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

/**
 * A session name derived from `base`: letters, digits, ".", "_" and "-", at
 * most 64 characters, alphanumeric at both ends, with a random suffix so it
 * is unique among the team's live sessions.
 */
export function sessionName(base: string): string {
    const stem = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").slice(0, 48);
    const suffix = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    return `${stem || "session"}-${suffix}`;
}

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

/**
 * Asks the API to mint the agent's DigitalOcean inference key, so the manifest
 * needs no key. The server skips it when the manifest brings its own
 * `HARNESS_INFERENCE_API_KEY`. The server accepts `manage_model_access_key`,
 * but it is not in the published API spec yet (November 2026), so these
 * requests are built by hand.
 */
export interface ManagedKeyOption {
    /**
     * Defaults to true, except for `harness: sandbox` or `none`, which run no
     * agent and so need no key. Set false where the API cannot mint keys.
     */
    manageModelAccessKey?: boolean;
}

/** Harness kinds that run no agent, so they get no managed key by default. */
const NO_AGENT = new Set(["sandbox", "none"]);

function wantsManagedKey(manifest: Manifest, option: boolean | undefined): boolean {
    if (option !== undefined) return option;
    // ponytail: reads a top-level `harness:` line only (the runtime has no YAML
    // parser); any other layout mints a key, as the default did before.
    const harness =
        typeof manifest === "string" ? /^harness:\s*["']?([\w-]+)/m.exec(manifest)?.[1] : manifest.harness;
    return !NO_AGENT.has(String(harness));
}

/** Saved environments. They are immutable: create a new one to change the manifest. */
export class Environments {
    constructor(private readonly ctx: RuntimeContext) {}

    /** Saves a manifest under a team-unique name. */
    async create(input: { name: string; manifest: Manifest } & ManagedKeyOption): Promise<Environment> {
        const info = new RequestInformation(HttpMethod.POST, ConfigsRequestBuilderUriTemplate);
        info.pathParameters.baseurl = this.ctx.adapter.baseUrl;
        info.headers.tryAdd("Accept", "application/json");
        const body = {
            name: input.name,
            manifest_yaml: manifestText(input.manifest),
            manage_model_access_key: wantsManagedKey(input.manifest, input.manageModelAccessKey),
        };
        info.setStreamContent(toArrayBuffer(new TextEncoder().encode(JSON.stringify(body))), "application/json");
        const res = await call(() =>
            this.ctx.adapter.send<Agent_config_response>(
                info,
                createAgent_config_responseFromDiscriminatorValue,
                ConfigsRequestBuilderRequestsMetadata.post?.errorMappings,
            ),
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
           * config for you, and `destroy()` deletes that config again, which also
           * revokes its managed key. To attach a workspace, save the manifest with
           * `environments.create` and pass `environment` instead.
           */
          manifest: Manifest;
      } & ManagedKeyOption
);

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
     * {@link SessionFailedError}. A session that fails or is not ready in time
     * is destroyed before the error is raised, since the caller never gets it.
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
            created = await this.createFromManifest(
                input.manifest,
                input.name,
                wantsManagedKey(input.manifest, input.manageModelAccessKey),
            );
        } else {
            const configId = typeof input.environment === "string" ? input.environment : input.environment.id;
            const workspaceId = typeof input.workspace === "string" ? input.workspace : input.workspace?.id;
            // This form of create requires a name; the manifest form does not.
            const name =
                input.name ?? sessionName(typeof input.environment === "string" ? "session" : input.environment.name);
            const res = await call(() => this.ctx.client.v2.agents.sessions.post({ configId, name, workspaceId }));
            created = res?.session;
        }

        const info = required(created, "the session");
        // The API saved the manifest as a config for this session; the session cleans it up.
        const session = new Session(this.ctx, info, "manifest" in input ? info.configId ?? undefined : undefined);
        if (input.wait !== false) {
            try {
                await session.waitUntilReady({ timeoutMs: input.timeoutMs });
            } catch (err) {
                await session.destroy().catch(() => undefined);
                throw err;
            }
        }
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
    private async createFromManifest(
        manifest: Manifest,
        name: string | undefined,
        manageModelAccessKey: boolean,
    ): Promise<Definitions_session | null | undefined> {
        const info = new RequestInformation(HttpMethod.POST, CREATE_SESSION_URI_TEMPLATE);
        info.pathParameters.baseurl = this.ctx.adapter.baseUrl;
        if (name !== undefined) info.queryParameters.name = name;
        if (manageModelAccessKey) info.queryParameters.manage_model_access_key = true;
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
    /**
     * How long to wait for the run to end before raising {@link TimeoutError}.
     * Defaults to 30 minutes; 0 waits without limit. Like `signal`, it stops
     * the wait, not the run.
     */
    timeoutMs?: number;
}

/** How long `run` waits for the attach to confirm before sending anyway. */
const ATTACH_WAIT_MS = 5_000;
/** How long `run` waits for a run to end, unless told otherwise. */
const RUN_TIMEOUT_MS = 30 * 60_000;

/** A Harness Runtime session. */
export class Session {
    /** Copy files in and out of the session's `/workspace` folder. */
    readonly files: SessionFiles;

    constructor(
        private readonly ctx: RuntimeContext,
        /** The session record as last read from the API. */
        public info: Definitions_session,
        /** The config the API saved for a session created from a manifest; `destroy()` deletes it. */
        private ownConfigId?: string,
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
        // The event stream ends quietly when its signal aborts, so `stop` carries
        // both the caller's signal and the timeout, and the catch says which fired.
        const stop = new AbortController();
        const onAbort = () => stop.abort(options.signal?.reason);
        if (options.signal?.aborted) onAbort();
        options.signal?.addEventListener("abort", onAbort, { once: true });
        const timeoutMs = options.timeoutMs ?? RUN_TIMEOUT_MS;
        let timedOut = false;
        const timer =
            timeoutMs > 0 && Number.isFinite(timeoutMs)
                ? setTimeout(() => {
                      timedOut = true;
                      stop.abort();
                  }, timeoutMs)
                : undefined;
        const events = this.events({ signal: stop.signal });
        let runId: string | undefined;
        try {
            // Attach first. The stream opens with a stream.state frame; once it has
            // arrived (or a short wait passes) the prompt goes out.
            const first = events.next();
            await settledOrTimeout(first, ATTACH_WAIT_MS);
            if (stop.signal.aborted) throw stop.signal.reason;
            runId = await this.send(text);

            let pending: Promise<IteratorResult<SessionEvent>> | undefined = first;
            let joined = "";
            for (;;) {
                const step: IteratorResult<SessionEvent> = await (pending ?? events.next());
                pending = undefined;
                if (step.done) {
                    if (stop.signal.aborted) throw stop.signal.reason;
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
            if (timedOut) {
                throw new TimeoutError(
                    runId
                        ? `run ${runId} on session ${this.id} did not end within ${timeoutMs} ms. It may still be ` +
                              `running: stop it with session.cancel("${runId}") or destroy the session`
                        : `session ${this.id} did not accept the prompt within ${timeoutMs} ms`,
                );
            }
            if (options.signal?.aborted && err === options.signal.reason) throw err;
            throw toHarnessError(err);
        } finally {
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", onAbort);
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
        // Forks share this session's config, so any of them may be the last to go and delete it.
        const forks = (res?.sessions ?? []).map((s) => new Session(this.ctx, s, this.ownConfigId));
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

    /**
     * Destroys the session and its sandbox. A persistent workspace survives.
     * For a session created from a manifest, also deletes the config the API
     * saved for it, which revokes its managed key, once no fork still uses it.
     */
    async destroy(): Promise<void> {
        await call(() => this.item.delete());
        await this.deleteOwnConfig();
    }

    private async deleteOwnConfig(): Promise<void> {
        const configId = this.ownConfigId;
        if (!configId) return;
        this.ownConfigId = undefined;
        await call(() => this.ctx.client.v2.agents.configs.byConfig_id(configId).delete()).catch((err) => {
            // 409: a fork still uses it, and deletes it when it is destroyed. 404: already gone.
            if (!(err instanceof ConflictError || err instanceof NotFoundError)) throw err;
        });
    }

    /**
     * Destroys the session when an `await using` block ends:
     *
     * ```ts
     * await using session = await hr.sessions.create({ manifest });
     * ```
     *
     * A session that is already gone is fine.
     *
     * Versions: `await using` needs TypeScript 5.2 or later, and the runtime
     * that runs the code must define `Symbol.asyncDispose` (Node 20 and later,
     * current Bun and Deno 2 do). Run plain JavaScript that uses `await using`
     * itself, not compiled by TypeScript, only on a runtime that supports the
     * syntax. Where either is missing, call `destroy()` in a `finally` block
     * instead; it does the same thing.
     */
    async [Symbol.asyncDispose](): Promise<void> {
        await this.destroy().catch(async (err) => {
            if (!(err instanceof NotFoundError)) throw err;
            await this.deleteOwnConfig();
        });
    }

    /**
     * Runs a command in the session's sandbox and returns once it exits. A
     * string runs through `sh -c`; an array runs as given, with no shell. A
     * non-zero exit is returned, not thrown. Pass `onStdout` or `onStderr` to
     * see output while the command runs.
     */
    exec(command: string | string[], options: ExecOptions = {}): Promise<ExecResult> {
        const streamed = options.onStdout || options.onStderr || options.signal;
        return (streamed ? execStreamed : execBuffered)(this.ctx, this.id, command, options);
    }

    /**
     * Starts a command and returns while it runs: `wait()` for the exit or
     * `kill()` it. With `stdin: true` you can also `write` to it and
     * `closeStdin()`; that is a preview, because the server side of live stdin
     * is still being built and its names may change (see exec.ts).
     */
    spawn(command: string | string[], options: SpawnOptions = {}): Promise<ExecProcess> {
        return spawn(this.ctx, this.id, command, options);
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
