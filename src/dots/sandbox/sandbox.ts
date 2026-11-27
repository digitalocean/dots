/**
 * DigitalOcean Sandbox SDK over `/v2/sandboxes`.
 *
 * Hand-written: `make generate` does not touch `src/dots/sandbox/`. Every call goes
 * through the generated Kiota client, so auth, retries and User-Agent match
 * the rest of the SDK.
 *
 * ```ts
 * import { Sandbox } from "@digitalocean/dots/sandbox";
 * const sandbox = await Sandbox.create({ template: "coding-base" });
 * await sandbox.pause();
 * await sandbox.resume();
 * await sandbox.kill();
 * ```
 */

import type { DigitalOceanClient } from "../digitalOceanClient.js";
import type { Manifest } from "../harnessRuntime/session.js";
import type { TriggerHandle } from "../harnessRuntime/triggers.js";
import { AgentSandbox } from "./agentSandbox.js";
import { Commands, type Command, type CommandStartOptions } from "./commands.js";
import { createExec, type ExecCallable, type ExecCallOptions, type ExecCommand, type ExecResult } from "./exec.js";
import {
    egressToInternetAccess,
    egressToManifest,
    ExecStream,
    permissionsToManifest,
    refuseNotBuilt,
    resolveImage,
    secretsToEnv,
    type Egress,
    type Image,
    type Permissions,
    type Secret,
} from "./spec.js";
import { Files } from "./files.js";
import { connect, rejectUnknownOptions, type ClientOptions, type Connection } from "./config.js";
import { call, fromHarnessError, NotFoundError, required, SandboxError, SandboxTimeoutError, UnsupportedError, viaHarness } from "./errors.js";
import {
    checkTriggerRequest,
    createTrigger,
    type CronSchedule,
    type TriggerBase,
    type WebhookSchedule,
    type WebhookTriggerResult,
} from "./triggers.js";
import { createSnapshot, type Snapshot, type SnapshotCreateOptions } from "./snapshots.js";
import { deleteSandbox, fetchInfo, pauseSandbox, resumeSandbox } from "./sandboxApi.js";
import { toInfo, type SandboxInfo, type SandboxState } from "./types.js";

/** Template used when `template` is omitted. */
export const DEFAULT_TEMPLATE = "coding-base";

/** `size_slug` used when `size` is omitted. The API requires one and it must be an enabled size. */
export const DEFAULT_SIZE = "mars-2vcpu-4gb";

export interface SandboxCreateOptions extends ClientOptions {
    /** Template to create the sandbox from. Defaults to {@link DEFAULT_TEMPLATE}. */
    template?: string;
    /** Size slug. Defaults to {@link DEFAULT_SIZE}. */
    size?: string;
    /** `false` limits egress to the platform file-transfer host. Defaults to unrestricted. */
    allowInternetAccess?: boolean;
    /** Environment variables for the sandbox. The values are secrets. */
    envVars?: Record<string, string>;
    /** What to boot from: an {@link Image} or a saved template name. The same as `template`, which this replaces. */
    image?: string | Image;
    /** A ready-made environment by name. Only `"coding"` exists. */
    environment?: string;
    /** `"none"`, `[]` or `"unrestricted"`. A bare sandbox has no host allowlist: that needs an agent. */
    egress?: Egress;
    /** Credentials as environment variables. The same as `envVars`, but a {@link Secret} bound to hosts is refused. */
    secrets?: Record<string, string | Secret>;
}

/** Which API a `get` or `list` call uses. `"sandbox"` (the default) is the sandbox API and `"session"` the harness API. */
export type SandboxKind = "sandbox" | "session";

/** `Sandbox.get(id)`: a bare sandbox, through the sandbox API. */
export interface SandboxGetOptions extends ClientOptions {
    kind?: "sandbox";
}

/** `Sandbox.get(id, { kind: "session" })`: an agent session, through the harness API only. */
export interface SessionGetOptions extends ClientOptions {
    kind: "session";
}

/** `Sandbox.list({ kind: "session" })`: the team's agent sessions, through the harness API only. */
export interface SessionListOptions extends ClientOptions {
    kind: "session";
    /** Return only sessions in this status, such as `SESSION_STATUS_READY`. */
    status?: string;
    /** Return only sessions whose name matches. */
    search?: string;
}

export interface SandboxListOptions extends ClientOptions {
    /** `"sandbox"` is the default. Use `"session"` (see {@link SessionListOptions}) for agent sessions. */
    kind?: "sandbox";
    /** Return only sandboxes in this state. */
    state?: SandboxState;
    /** Page size. */
    limit?: number;
    /** Resume after the `nextToken` of an earlier page. */
    nextToken?: string;
}

export interface WaitOptions {
    /** Defaults to 2 minutes. */
    timeoutMs?: number;
    /** Defaults to 1 s. */
    pollIntervalMs?: number;
}

/** The agent to run, as options instead of a manifest: `Sandbox.create({ agent: { harness: "opencode", model } })`. `new Agent(harness, options)` is the same thing as a value. */
export interface AgentOptions {
    /** The agent: `opencode`, `claude-code`, `codex`, and so on. `sandbox` and `none` run no agent and are refused. */
    harness: string;
    /** The model, set as `HARNESS_INFERENCE_MODEL` in the agent's environment. */
    model?: string;
    /** Environment variables for the agent and its sandbox. */
    env?: Record<string, string>;
    /** Secrets for the agent, such as a model key. Not logged and not in the saved config. */
    secrets?: Record<string, string>;
    /** Tool rules: a {@link Permissions}, or a manifest block such as `{ default: "allow", rules: [{ tool: "bash", action: "ask" }] }`. */
    permissions?: Permissions | Record<string, unknown>;
}

/**
 * The agent to run: `new Agent("opencode", { model })`. The same options as {@link AgentOptions}, with the harness
 * as the first argument. Pass it as `Sandbox.create({ agent })`.
 *
 * ```ts
 * const box = await Sandbox.create({ agent: new Agent("opencode", { model: "anthropic-claude-5.5-haiku" }) });
 * ```
 */
export class Agent {
    /** The agent: `opencode`, `claude-code`, `codex`, and so on. */
    readonly harness: string;
    /** The model, env, secrets and permissions, as in {@link AgentOptions}. */
    readonly options: Readonly<Omit<AgentOptions, "harness">>;

    constructor(harness: string, options: Omit<AgentOptions, "harness"> = {}) {
        this.harness = harness;
        this.options = { ...options };
    }
}

/** What `Sandbox.trigger` runs on each firing: an agent, or a full manifest. */
export type SandboxTriggerOptions = TriggerBase &
    ClientOptions &
    ({ agent: Agent | AgentOptions; manifest?: never } | { manifest: Manifest; agent?: never });

interface AgentCreateBase extends ClientOptions {
    /** Session name, unique among the team's live sessions. */
    name?: string;
    /** `false` returns as soon as the session is allocated, without waiting for it to be ready. */
    wait?: boolean;
    /** How long to wait for the session to be ready. Defaults to 10 minutes. */
    timeoutMs?: number;
    /** Defaults to true: mint the agent's DigitalOcean inference key. `false` brings your own. */
    manageModelAccessKey?: boolean;
    /** What the agent's sandbox boots from. Only `"coding"` or a saved template name work. */
    image?: string | Image;
    /** A ready-made environment by name. Only `"coding"` exists. */
    environment?: string;
    /** Where the sandbox may connect: a host list, `"none"`, `"unrestricted"` or `{ allowHosts, allowIps }`. */
    egress?: Egress;
    /** Credentials for the sandbox and agent, added to `agent.secrets`. A {@link Secret} bound to hosts is refused. */
    secrets?: Record<string, string | Secret>;
    /** The options of a bare sandbox cannot be combined with an agent. */
    template?: never;
    size?: never;
    allowInternetAccess?: never;
    envVars?: never;
}

/**
 * `Sandbox.create({ agent })` or `Sandbox.create({ manifest })`: creates a Harness Runtime session and returns an
 * {@link AgentSandbox}. Pass the agent as `agent` options, or as a full `manifest` (YAML text or an object), not
 * both. Either way it must name an agent (`harness: opencode`, and so on).
 */
export type AgentSandboxCreateOptions = AgentCreateBase &
    ({ agent: Agent | AgentOptions; manifest?: never } | { manifest: Manifest; agent?: never });

const BARE_ONLY_KEYS = ["template", "size", "allowInternetAccess", "envVars"];
const CREATE_KEYS = [...BARE_ONLY_KEYS, "image", "environment", "egress", "secrets"];
const AGENT_CREATE_KEYS = ["agent", "manifest", "name", "wait", "timeoutMs", "manageModelAccessKey", "image", "environment", "egress", "secrets"];
const LIST_KEYS = ["kind", "state", "limit", "nextToken"];
const SESSION_LIST_KEYS = ["kind", "status", "search"];
const KINDS = new Set<string>(["sandbox", "session"]);

function checkKind(kind: unknown, where: string): void {
    if (kind !== undefined && !KINDS.has(String(kind))) {
        throw new SandboxError(`${where}: \`kind\` must be "sandbox" or "session"`);
    }
}

export class Sandbox {
    /** Tells this apart from an {@link AgentSandbox}, which has `kind: "session"`. */
    readonly kind = "sandbox" as const;

    /** The record as last returned by the API. Call {@link getInfo} to refresh it. */
    info: SandboxInfo;

    /** Start, list and stream the commands running in this sandbox. */
    readonly commands: Commands;

    /** Read, write, list and manage the files in this sandbox. */
    readonly files: Files;

    /** Run processes with their output streamed on the same request, optionally with stdin or a PTY. */
    readonly exec: ExecCallable;

    private readonly client: DigitalOceanClient;
    private readonly conn: Connection;

    private constructor(conn: Connection, info: SandboxInfo) {
        this.conn = conn;
        this.client = conn.client;
        this.info = info;
        this.commands = new Commands(conn, info.sandboxId);
        this.files = new Files(conn, info.sandboxId);
        this.exec = createExec(conn, info.sandboxId);
    }

    get sandboxId(): string {
        return this.info.sandboxId;
    }
    get state(): SandboxState {
        return this.info.state;
    }
    get template(): string {
        return this.info.template;
    }

    /**
     * A bare sandbox has no agent. Reading `sbx.agent` does not throw: every call on it, at any depth
     * (`sbx.agent.run(...)`, `sbx.agent.files.write(...)`, `sbx.agent("codex")`), returns a promise that rejects with
     * {@link UnsupportedError}, so `await` in a `try` or a `.catch` handles it. An unhandled rejection still ends a Node process.
     * Create the sandbox with `agent` or `manifest` (`Sandbox.create({ agent })`) to get an {@link AgentSandbox}.
     */
    get agent(): NoAgent {
        return noAgent();
    }

    /**
     * Creates a sandbox and resolves once it is running. Without `agent` or `manifest` it calls the sandbox API
     * (`POST /v2/sandboxes`) and returns a bare `Sandbox`. With one it calls the harness API
     * (`POST /v2/harness-runtime/sessions`) and returns an {@link AgentSandbox}.
     */
    static async create(opts?: SandboxCreateOptions): Promise<Sandbox>;
    static async create(opts: AgentSandboxCreateOptions): Promise<AgentSandbox>;
    static async create(opts: SandboxCreateOptions | AgentSandboxCreateOptions = {}): Promise<Sandbox | AgentSandbox> {
        const o = opts as { manifest?: unknown; agent?: unknown };
        if (o.manifest !== undefined || o.agent !== undefined) return createAgent(opts as AgentSandboxCreateOptions);
        return Sandbox.createBare(opts as SandboxCreateOptions);
    }

    private static async createBare(opts: SandboxCreateOptions): Promise<Sandbox> {
        refuseNotBuilt(opts, "Sandbox.create");
        if ((opts as { name?: unknown }).name !== undefined) {
            throw new UnsupportedError("Sandbox.create: `name` is not supported on a bare sandbox yet: the sandbox API has no name field");
        }
        rejectUnknownOptions(opts, CREATE_KEYS, "Sandbox.create");
        const image = resolveImage(opts.image, opts.environment, "Sandbox.create");
        if (image !== undefined && opts.template !== undefined) {
            throw new SandboxError("Sandbox.create: pass `image` or `template`, not both");
        }
        const template = image ?? opts.template ?? DEFAULT_TEMPLATE;
        if (!template.trim()) {
            throw new SandboxError("Sandbox.create: `template` must not be empty");
        }
        if (opts.egress !== undefined && opts.allowInternetAccess !== undefined) {
            throw new SandboxError("Sandbox.create: pass `egress` or `allowInternetAccess`, not both");
        }
        const allowInternetAccess = opts.egress !== undefined ? egressToInternetAccess(opts.egress, "Sandbox.create") : opts.allowInternetAccess;
        let envVars = opts.envVars;
        if (opts.secrets !== undefined) {
            const fromSecrets = secretsToEnv(opts.secrets, "Sandbox.create");
            const dup = Object.keys(fromSecrets).filter((k) => opts.envVars && k in opts.envVars);
            if (dup.length) throw new SandboxError(`Sandbox.create: ${dup.join(", ")} is in both \`secrets\` and \`envVars\``);
            envVars = { ...opts.envVars, ...fromSecrets };
        }
        const conn = connect(opts);
        const res = await call(() =>
            conn.client.v2.sandboxes.post({
                template,
                sizeSlug: opts.size ?? DEFAULT_SIZE,
                allowInternetAccess,
                envVars: envVars ? { additionalData: { ...envVars } } : undefined,
            }),
        );
        return new Sandbox(conn, toInfo(res?.sandbox));
    }

    /**
     * Fetches a sandbox by id through the sandbox API and returns a bare `Sandbox`. With `{ kind: "session" }` it
     * fetches an agent session through the harness API only and returns an {@link AgentSandbox}. The kind picks
     * the API: nothing tries the other one or falls back to it.
     */
    static async get(sandboxId: string, opts?: SandboxGetOptions): Promise<Sandbox>;
    static async get(sessionId: string, opts: SessionGetOptions): Promise<AgentSandbox>;
    static async get(id: string, opts: SandboxGetOptions | SessionGetOptions = {}): Promise<Sandbox | AgentSandbox> {
        checkKind(opts.kind, "Sandbox.get");
        if (opts.kind === "session") return Sandbox.getSession(id, opts);
        const conn = connect(opts);
        return new Sandbox(conn, await fetchInfo(conn.client, id));
    }

    /** Fetches an agent session by session id, through the harness API. Returns an {@link AgentSandbox}. */
    static async getSession(sessionId: string, opts: ClientOptions & { kind?: "session" } = {}): Promise<AgentSandbox> {
        if (!sessionId?.trim()) throw new SandboxError("`sessionId` is required");
        const conn = connect(opts);
        return new AgentSandbox(await viaHarness(() => conn.harness().sessions.get(sessionId)), conn);
    }

    /**
     * Runs an agent on a schedule or from a webhook, in a fresh session for each run. Describe the agent with
     * `agent` (an {@link Agent} or options) or a full `manifest`. `cron` returns the trigger; `webhook` returns
     * `{ trigger, setup }`, where `setup` holds the URL and the signing secret, which is shown only once.
     *
     * A trigger's sessions get no managed inference key, so the agent must bring its own: put it in
     * `agent.secrets` (or the manifest's `secrets`). To run an existing session on a schedule instead, use
     * `box.trigger(...)`. The returned trigger is the harness `TriggerHandle`: its errors are harness errors.
     *
     * ```ts
     * const t = await Sandbox.trigger({
     *     name: "standup", prompt: "Write a status note", cron: "0 9 * * 1-5", timezone: "Asia/Kolkata",
     *     agent: new Agent("opencode", { secrets: { OPENAI_API_KEY: key } }),
     * });
     * ```
     */
    static async trigger(opts: SandboxTriggerOptions & CronSchedule): Promise<TriggerHandle>;
    static async trigger(opts: SandboxTriggerOptions & WebhookSchedule): Promise<WebhookTriggerResult>;
    static async trigger(opts: SandboxTriggerOptions & (CronSchedule | WebhookSchedule)): Promise<TriggerHandle | WebhookTriggerResult> {
        checkTriggerRequest(opts, ["agent", "manifest", "token", "apiUrl"], "Sandbox.trigger");
        if (opts.manifest !== undefined && opts.agent !== undefined) {
            throw new SandboxError("Sandbox.trigger: pass `agent` or `manifest`, not both");
        }
        if (opts.manifest === undefined && opts.agent === undefined) {
            throw new SandboxError("Sandbox.trigger: pass `agent` or `manifest`, the agent each run starts. To use an existing session, call box.trigger()");
        }
        const manifest = opts.agent !== undefined ? manifestFromAgent(opts.agent) : (opts.manifest as Manifest);
        assertAgentManifest(manifest);
        const { agent: _agent, manifest: _manifest, token: _token, apiUrl: _apiUrl, ...request } = opts;
        return createTrigger(connect(opts), { manifest }, request as never);
    }

    /** Fetches a sandbox by id and resumes it if it is paused. */
    static async connect(sandboxId: string, opts: ClientOptions = {}): Promise<Sandbox> {
        const sandbox = await Sandbox.get(sandboxId, opts);
        if (sandbox.state === "SANDBOX_STATE_PAUSED") await sandbox.resume();
        return sandbox;
    }

    /**
     * Lists the team's sandboxes. Iterate it to walk every page, or call
     * `nextItems()` for one page at a time.
     */
    static list(opts?: SandboxListOptions): SandboxPaginator;
    /** With `{ kind: "session" }`, lists agent sessions through the harness API only. Iterate it with `for await`. */
    static list(opts: SessionListOptions): AsyncGenerator<AgentSandbox>;
    static list(opts: SandboxListOptions | SessionListOptions = {}): SandboxPaginator | AsyncGenerator<AgentSandbox> {
        checkKind(opts.kind, "Sandbox.list");
        if (opts.kind === "session") {
            rejectUnknownOptions(opts, SESSION_LIST_KEYS, "Sandbox.list");
            return listSessions(connect(opts), opts);
        }
        rejectUnknownOptions(opts, LIST_KEYS, "Sandbox.list");
        return new SandboxPaginator(connect(opts), opts as SandboxListOptions);
    }

    /** Deletes a sandbox by id. Resolves `false` when it does not exist. */
    static async kill(sandboxId: string, opts: ClientOptions = {}): Promise<boolean> {
        return deleteSandbox(connect(opts).client, sandboxId);
    }

    /** Pauses a sandbox by id. */
    static async pause(sandboxId: string, opts: ClientOptions = {}): Promise<SandboxInfo> {
        return pauseSandbox(connect(opts).client, sandboxId);
    }

    /** Reads the sandbox again. */
    async getInfo(): Promise<SandboxInfo> {
        this.info = await fetchInfo(this.client, this.sandboxId);
        return this.info;
    }

    /** True when the sandbox is running right now. Reads the API. */
    async isRunning(): Promise<boolean> {
        return (await this.getInfo()).state === "SANDBOX_STATE_RUNNING";
    }

    /** Pauses the sandbox. Resume it to use it again. */
    async pause(): Promise<SandboxInfo> {
        this.info = await pauseSandbox(this.client, this.sandboxId);
        return this.info;
    }

    /** Resumes a paused sandbox. */
    async resume(): Promise<SandboxInfo> {
        this.info = await resumeSandbox(this.client, this.sandboxId);
        return this.info;
    }

    /**
     * Starts a snapshot of this sandbox, which must be running or paused.
     * Resolves in the `CREATING` state: call `snapshot.waitUntilReady()`.
     */
    async createSnapshot(opts: SnapshotCreateOptions = {}): Promise<Snapshot> {
        return createSnapshot(this.conn, this.sandboxId, opts, "sandbox.createSnapshot");
    }

    /**
     * Runs a command and streams its output as it arrives: `for await (const c of sbx.execStream("npm ci")) ...`.
     * After the loop `stream.result` is the same result `exec` returns.
     */
    execStream(command: ExecCommand, opts: Omit<ExecCallOptions, "onStdout" | "onStderr"> = {}): ExecStream<ExecResult> {
        return new ExecStream<ExecResult>((on) => this.exec(command, { ...opts, ...on }));
    }

    /** Starts a command in the background and returns while it runs: `proc.wait()` or `proc.kill()`. */
    spawn(command: string, opts: CommandStartOptions = {}): Promise<Command> {
        return this.commands.start(command, opts);
    }

    /** The background commands: `sbx.processes.list()`. */
    get processes(): Commands {
        return this.commands;
    }

    /**
     * Deletes the sandbox. The same as {@link kill}. `purgeHistory` is refused: a bare sandbox keeps no platform
     * records to purge.
     */
    async delete(opts: { purgeHistory?: boolean } = {}): Promise<boolean> {
        if (opts.purgeHistory) throw new UnsupportedError("sandbox.delete: `purgeHistory` is not supported: a bare sandbox has no platform records");
        return this.kill();
    }

    /** Deletes the sandbox. Resolves `false` when it is already gone. */
    async kill(): Promise<boolean> {
        return deleteSandbox(this.client, this.sandboxId);
    }

    /** Polls until the sandbox is running. Raises if it is paused or the wait runs out. */
    async waitUntilRunning(opts: WaitOptions = {}): Promise<this> {
        const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
        for (;;) {
            const { state } = this.info;
            if (state === "SANDBOX_STATE_RUNNING") return this;
            if (state !== "SANDBOX_STATE_CREATING") {
                throw new SandboxError(`sandbox ${this.sandboxId} will not become running: ${state}`);
            }
            if (Date.now() >= deadline) {
                throw new SandboxTimeoutError(`sandbox ${this.sandboxId} was not running in time (last state ${state})`);
            }
            await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 1_000));
            await this.getInfo();
        }
    }

    /** `await using sandbox = await Sandbox.create(...)` kills the sandbox at scope exit. */
    async [Symbol.asyncDispose](): Promise<void> {
        await this.kill();
    }
}

async function* listSessions(conn: Connection, opts: SessionListOptions): AsyncGenerator<AgentSandbox> {
    try {
        for await (const s of conn.harness().sessions.list({ status: opts.status, search: opts.search })) {
            yield new AgentSandbox(s, conn);
        }
    } catch (err) {
        throw fromHarnessError(err);
    }
}

/** Harness kinds that run no agent: those are a bare sandbox, so `Sandbox.create()` makes them. */
const NO_AGENT = new Set(["sandbox", "none"]);

/** Refuses a manifest that names no agent, before any request. Reads a top-level `harness:` the way the harness SDK does. */
function assertAgentManifest(manifest: Manifest): void {
    const text = typeof manifest === "string" ? manifest : undefined;
    if (text !== undefined && /^apiVersion:/m.test(text)) return; // the legacy envelope: the API reads the agent
    const harness = text !== undefined ? /^harness:\s*["']?([\w-]+)/m.exec(text)?.[1] : (manifest as { harness?: unknown }).harness;
    if (harness === undefined || NO_AGENT.has(String(harness))) {
        throw new SandboxError(
            "Sandbox.create({ manifest }) creates an agent session, so the manifest must name an agent, such as " +
                "`harness: opencode`. For a bare sandbox call Sandbox.create() with no manifest.",
        );
    }
}

const AGENT_KEYS = ["harness", "model", "env", "secrets", "permissions"];

/** Builds the manifest for `Sandbox.create({ agent })`. Nothing is sent for a bad `agent`. */
function manifestFromAgent(input: Agent | AgentOptions): Record<string, unknown> {
    const agent: AgentOptions = input instanceof Agent ? { ...input.options, harness: input.harness } : input;
    if (agent === null || typeof agent !== "object") throw new SandboxError("Sandbox.create: `agent` must be an object");
    const bad = Object.keys(agent).filter((k) => !AGENT_KEYS.includes(k) && (agent as unknown as Record<string, unknown>)[k] !== undefined);
    if (bad.length) throw new SandboxError(`Sandbox.create: unsupported agent option${bad.length > 1 ? "s" : ""} ${bad.join(", ")}`);
    if (typeof agent.harness !== "string" || !agent.harness.trim()) {
        throw new SandboxError("Sandbox.create: `agent.harness` is required, such as `opencode`");
    }
    const env = { ...agent.env };
    if (agent.model !== undefined) {
        if (!agent.model.trim()) throw new SandboxError("Sandbox.create: `agent.model` must not be empty");
        if ("HARNESS_INFERENCE_MODEL" in env) {
            throw new SandboxError("Sandbox.create: pass `agent.model` or `agent.env.HARNESS_INFERENCE_MODEL`, not both");
        }
        env.HARNESS_INFERENCE_MODEL = agent.model;
    }
    const manifest: Record<string, unknown> = { harness: agent.harness };
    if (Object.keys(env).length) manifest.env = env;
    if (agent.secrets && Object.keys(agent.secrets).length) manifest.secrets = { ...agent.secrets };
    if (agent.permissions) manifest.permissions = permissionsToManifest(agent.permissions);
    return manifest;
}

/**
 * Puts the sandbox-layer options (`image`, `egress`, `secrets`) on an agent's manifest. A name goes in as
 * `template` and a host list as `egress`, the flat manifest keys; secrets join the agent's own.
 */
function applySandboxLayer(manifest: Record<string, unknown>, opts: AgentSandboxCreateOptions): void {
    const image = resolveImage(opts.image, opts.environment, "Sandbox.create");
    if (image !== undefined) manifest.template = image;
    if (opts.egress !== undefined) manifest.egress = egressToManifest(opts.egress, "Sandbox.create");
    if (opts.secrets !== undefined) {
        const plain = secretsToEnv(opts.secrets, "Sandbox.create");
        const existing = (manifest.secrets ?? {}) as Record<string, string>;
        const dup = Object.keys(plain).filter((k) => k in existing);
        if (dup.length) throw new SandboxError(`Sandbox.create: ${dup.join(", ")} is in both \`secrets\` and \`agent.secrets\``);
        manifest.secrets = { ...existing, ...plain };
    }
}

async function createAgent(opts: AgentSandboxCreateOptions): Promise<AgentSandbox> {
    refuseNotBuilt(opts, "Sandbox.create");
    const conflicting = BARE_ONLY_KEYS.filter((k) => (opts as unknown as Record<string, unknown>)[k] !== undefined);
    if (conflicting.length) {
        throw new SandboxError(`Sandbox.create: \`manifest\` and \`agent\` cannot be combined with ${conflicting.join(", ")}`);
    }
    rejectUnknownOptions(opts, AGENT_CREATE_KEYS, "Sandbox.create");
    if (opts.manifest !== undefined && opts.agent !== undefined) {
        throw new SandboxError("Sandbox.create: pass `agent` or `manifest`, not both");
    }
    const layered = ["image", "environment", "egress", "secrets"].filter((k) => (opts as unknown as Record<string, unknown>)[k] !== undefined);
    if (opts.manifest !== undefined && layered.length) {
        throw new SandboxError(`Sandbox.create: a \`manifest\` holds the whole spec, so put ${layered.join(", ")} in it, or use \`agent\``);
    }
    const manifest = opts.agent !== undefined ? manifestFromAgent(opts.agent) : (opts.manifest as Manifest);
    if (opts.agent !== undefined) applySandboxLayer(manifest as Record<string, unknown>, opts);
    assertAgentManifest(manifest);
    const conn = connect(opts);
    const session = await viaHarness(() =>
        conn.harness().sessions.create({
            manifest,
            name: opts.name,
            wait: opts.wait,
            timeoutMs: opts.timeoutMs,
            manageModelAccessKey: opts.manageModelAccessKey,
        }),
    );
    return new AgentSandbox(session, conn);
}

/** One page at a time via `nextItems()`, or every sandbox via `for await`. */
export class SandboxPaginator implements AsyncIterable<Sandbox> {
    private token: string | undefined;
    private started = false;

    /** @internal */
    constructor(
        private readonly conn: Connection,
        private readonly opts: SandboxListOptions,
    ) {
        this.token = opts.nextToken || undefined;
    }

    /** True until a page came back without a next-page token. */
    get hasNext(): boolean {
        return !this.started || this.token !== undefined;
    }

    /** The token that resumes after the last page read, if there is one. */
    get nextToken(): string | undefined {
        return this.token;
    }

    async nextItems(): Promise<Sandbox[]> {
        if (!this.hasNext) throw new SandboxError("no more sandboxes to list");
        const res = await call(() =>
            this.conn.client.v2.sandboxes.get({
                queryParameters: { pageSize: this.opts.limit, pageToken: this.token, state: this.opts.state },
            }),
        );
        this.started = true;
        this.token = res?.nextPageToken || undefined;
        return (res?.sandboxes ?? []).map((m) => new (Sandbox as any)(this.conn, toInfo(m)) as Sandbox);
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<Sandbox> {
        while (this.hasNext) yield* await this.nextItems();
    }
}


/** The type of `sbx.agent` on a bare sandbox: any call, at any depth, returns a rejected promise. */
export type NoAgent = ((...args: unknown[]) => Promise<never>) & { readonly [key: string]: NoAgent };

function noAgent(): NoAgent {
    const fail = (): Promise<never> =>
        Promise.reject(
            new UnsupportedError(
                'a bare sandbox (kind "sandbox") has no agent. Create one with ' +
                    "Sandbox.create({ agent }) or Sandbox.create({ manifest }) to use `sbx.agent`.",
            ),
        );
    const make = (): NoAgent =>
        new Proxy(fail, {
            get: (_t, prop) => (typeof prop === "symbol" || prop === "then" ? undefined : make()), // not thenable, no surprises in logs
        }) as unknown as NoAgent;
    return make();
}
