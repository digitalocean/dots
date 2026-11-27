/**
 * A sandbox created from an agent manifest: a Harness Runtime session with an agent in it.
 *
 * Two APIs, split by where you call from:
 * - `box.<call>` is the sandbox API (`/v2/sandboxes/{sandboxId}/...`), keyed by the session's `sandboxId`:
 *   `exec`, `execStream`, `spawn`, `commands`, `files`, `pause`, `resume`, `kill`, `createSnapshot`, `getInfo`.
 *   It is the same code a bare `Sandbox` runs.
 * - `box.agent.<call>` is the harness API (`/v2/harness-runtime/sessions/{sessionId}/...`).
 * `box.agent` and `box.trigger` have no sandbox API, so they call the harness API. A bare `Sandbox` has no
 * session operations. `kind` tells the two apart.
 *
 * ```ts
 * await using box = await Sandbox.create({ agent });
 * await box.exec("pytest -x", { check: true });          // sandbox API
 * await box.agent.run("Fix the failing test");           // harness API
 * await box.agent.checkpoint();                        // harness API
 * ```
 */

import type { ApprovalRequest, Session } from "../harnessRuntime/session.js";
import type { TriggerHandle } from "../harnessRuntime/triggers.js";
import type { Connection } from "./config.js";
import { Commands, type Command, type CommandStartOptions } from "./commands.js";
import { createExec, type ExecCallable, type ExecCallOptions, type ExecCommand, type ExecResult } from "./exec.js";
import { Files } from "./files.js";
import { NotFoundError, SandboxError, UnsupportedError, viaHarness } from "./errors.js";
import { deleteSandbox, fetchInfo, pauseSandbox, resumeSandbox } from "./sandboxApi.js";
import { createSnapshot, type Snapshot, type SnapshotCreateOptions } from "./snapshots.js";
import { ExecStream } from "./spec.js";
import type { SandboxInfo } from "./types.js";
import {
    checkTriggerRequest,
    createTrigger,
    type CronSchedule,
    type TriggerBase,
    type WebhookSchedule,
    type WebhookTriggerResult,
} from "./triggers.js";

/**
 * The agent in an agent session: `box.agent()`. Talks to the agent only, through the harness API. The sandbox
 * calls (`exec`, `files`) stay on the {@link AgentSandbox} and do not wait for a run.
 */
export class AgentHandle {
    private approvalHandler?: AgentRunOptions["onApproval"];

    /** @internal Use `box.agent`. */
    constructor(private readonly session: Session) {}

    /**
     * Sends a prompt and resolves when the turn ends. `onText` streams the answer, `onApproval` answers requests
     * (`req.approve()`, `req.reject(reason)` or `req.defer()`); without it the handler from {@link onApproval} is used.
     */
    run(text: string, options: AgentRunOptions = {}): ReturnType<Session["run"]> {
        const handler = options.onApproval ?? this.approvalHandler;
        const onApproval = handler && ((req: ApprovalRequest) => handler(Object.assign(req, { tool: req.toolName })));
        return viaHarness(() => this.session.run(text, { ...options, onApproval }));
    }

    /** Sets the handler `run` uses for approvals when the call passes none. Resolves the handle, so calls chain. */
    onApproval(handler: AgentRunOptions["onApproval"]): this {
        this.approvalHandler = handler;
        return this;
    }

    /** Approves a request by its id, from any process that can read the session. */
    approve(requestId: string, reason?: string): Promise<void> {
        return this.resolveApproval(requestId, "approve", reason);
    }

    /** Rejects a request by its id. */
    reject(requestId: string, reason?: string): Promise<void> {
        return this.resolveApproval(requestId, "reject", reason);
    }

    /** Leaves a request for a person: it stays pending. */
    defer(requestId: string, reason?: string): Promise<void> {
        return this.resolveApproval(requestId, "defer", reason);
    }

    /** Not built: the agent is fixed when the session is created, so it cannot be detached. */
    detach(): never {
        throw new UnsupportedError("agent.detach is not supported: the agent is fixed when the session is created");
    }

    /** Sends a prompt without waiting. Resolves the run id. */
    send(text: string): Promise<string> {
        return viaHarness(() => this.session.send(text));
    }

    /** The live event stream. Reconnects on its own. Leave the loop to disconnect. */
    events(options?: Parameters<Session["events"]>[0]): ReturnType<Session["events"]> {
        return this.session.events(options);
    }

    /** A finished replay of recent events, oldest first: `{ events, truncated }`. Pass `{ from }` to resume after an event id. */
    history(options?: Parameters<Session["history"]>[0]): ReturnType<Session["history"]> {
        return viaHarness(() => this.session.history(options));
    }

    /** Cancels the current turn, or the given run: `acked`, `no_turn` (nothing was running) or `unsupported` (this agent cannot be interrupted). */
    cancel(runId?: string): ReturnType<Session["cancel"]> {
        return viaHarness(() => this.session.cancel(runId));
    }

    /** Answers an approval request by its id, from any process that can read the session. */
    resolveApproval(id: string, outcome: "approve" | "reject" | "defer", reason?: string): Promise<void> {
        return viaHarness(() => this.session.resolveApproval(id, outcome, reason));
    }
}

/** An approval request, with the tool the agent wants to use as `tool` as well as `toolName`. */
export type AgentApproval = ApprovalRequest & { tool?: string };

/** The options of {@link AgentHandle.run}: the harness `run` options, with `onApproval` getting an {@link AgentApproval}. */
export type AgentRunOptions = Omit<NonNullable<Parameters<Session["run"]>[1]>, "onApproval"> & {
    onApproval?: (request: AgentApproval) => void | Promise<void>;
};

/**
 * `box.agent`: the agent's calls (`box.agent.run(...)`, with errors mapped to sandbox errors), then every other
 * harness `Session` call as the harness SDK has it (`checkpoint`, `fork`, `exec`, `files`, `destroy`). Called with
 * no arguments it is the agent handle. Attaching an agent to a sandbox that has none (`box.agent("codex", {
 * model })`) is not built: the agent is chosen at create.
 */
export type AgentAccessor = AgentHandle &
    Omit<Session, keyof AgentHandle> & {
        (): AgentHandle;
        (harness: string, options?: object): never;
    };

function agentAccessor(handle: AgentHandle, session: Session): AgentAccessor {
    const call = (...args: unknown[]): AgentHandle => {
        if (args.length) {
            throw new UnsupportedError(
                "attaching an agent after create is not supported: the harness is fixed when the session is created. " +
                    "Pass `agent` to Sandbox.create instead.",
            );
        }
        return handle;
    };
    return new Proxy(call, {
        get(_t, prop) {
            const owner = Reflect.has(handle, prop) ? handle : session;
            const v = Reflect.get(owner, prop, owner) as unknown;
            return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(owner) : v;
        },
    }) as unknown as AgentAccessor;
}

export class AgentSandbox {
    /** Tells this apart from a bare {@link Sandbox}, which has `kind: "sandbox"`. */
    readonly kind = "session" as const;

    /**
     * The harness API: `box.agent.run("Fix the test", { onText })`, `events`, `approve(id)`, and every harness
     * `Session` call (`checkpoint`, `fork`, `pause`, `refresh`, `waitUntilReady`, `destroy`, `exec` with its harness
     * result, `spawn` with live stdin, `files`). Called with no arguments it returns the agent handle.
     */
    readonly agent: AgentAccessor;

    private readonly harnessSession: Session;

    private readonly conn: Connection;

    /** @internal Use `Sandbox.create({ agent })`, `Sandbox.create({ manifest })` or `Sandbox.getSession(id)`. */
    constructor(session: Session, conn: Connection) {
        this.conn = conn;
        this.harnessSession = session;
        this.agent = agentAccessor(new AgentHandle(session), session);
    }

    get sessionId(): string {
        return this.harnessSession.id;
    }

    /** The sandbox every `box.<call>` is made on. A rollback replaces it, so this reads the session each time. */
    get sandboxId(): string {
        const id = this.harnessSession.info.sandboxId;
        if (!id) {
            throw new SandboxError(`session ${this.harnessSession.id} has no sandbox yet: call box.agent.waitUntilReady() first`);
        }
        return id;
    }

    /** Why the session is paused, when it is: `manual`, `idle` and so on. `undefined` while it runs. The session's record, not an API call. */
    get pauseReason(): string | undefined {
        return this.harnessSession.pauseReason;
    }

    /** The raw session status, such as `SESSION_STATUS_READY`. The session's record, not an API call. */
    get status(): string | undefined {
        return this.harnessSession.status;
    }

    /** Start, list and stream the commands running in this sandbox. The sandbox API. */
    get commands(): Commands {
        return new Commands(this.conn, this.sandboxId);
    }

    /** Read, write, list and manage the files in this sandbox. The sandbox API. */
    get files(): Files {
        return new Files(this.conn, this.sandboxId);
    }

    /** Runs a process with its output streamed on the same request, optionally with stdin or a PTY. The sandbox API: `await box.exec("ls", { check: true })`. */
    get exec(): ExecCallable {
        return createExec(this.conn, this.sandboxId);
    }

    /**
     * Runs a command and streams its output as it arrives: `for await (const c of box.execStream("npm ci")) ...`.
     * After the loop `stream.result` is the same result `exec` returns. The sandbox API.
     */
    execStream(command: ExecCommand, opts: Omit<ExecCallOptions, "onStdout" | "onStderr"> = {}): ExecStream<ExecResult> {
        return new ExecStream<ExecResult>((on) => this.exec(command, { ...opts, ...on }));
    }

    /** Starts a command in the background and returns while it runs: `proc.wait()` or `proc.kill()`. The sandbox API. */
    spawn(command: string, opts: CommandStartOptions = {}): Promise<Command> {
        return this.commands.start(command, opts);
    }

    /** The background commands: `box.processes.list()`. The sandbox API. */
    get processes(): Commands {
        return this.commands;
    }

    /**
     * Runs this session's agent on a schedule or from a webhook. The trigger is bound to this session: each run
     * resumes it, so the agent keeps its files and history. A bound session must be paused when a run fires and
     * is best treated as dedicated to the trigger, because messaging it or any call that resumes it wakes it.
     * Pass `pause: true` to pause the session first (`box.agent.pause()`). Without `pause`, a session that is still awake is for the API to
     * accept or reject. `cron` returns the trigger; `webhook` returns `{ trigger, setup }`, where `setup` holds the
     * URL and the signing secret, which is shown only once. The harness API: the sandbox API has no triggers.
     *
     * ```ts
     * const t = await box.trigger({ name: "docs-sync", prompt: "Sync the docs", cron: "0 * * * *", pause: true });
     * ```
     */
    async trigger(opts: TriggerBase & CronSchedule & { pause?: boolean }): Promise<TriggerHandle>;
    async trigger(opts: TriggerBase & WebhookSchedule & { pause?: boolean }): Promise<WebhookTriggerResult>;
    async trigger(opts: (TriggerBase & (CronSchedule | WebhookSchedule)) & { pause?: boolean }): Promise<TriggerHandle | WebhookTriggerResult> {
        checkTriggerRequest(opts, ["pause"], "box.trigger");
        const { pause, ...request } = opts;
        if (pause) await viaHarness(() => this.harnessSession.pause()); // the trigger needs the session paused, not just its sandbox
        return createTrigger(this.conn, { session: this.sessionId }, request);
    }

    /** Reads the sandbox record again. The sandbox API. For the session record use `box.agent.refresh()`. */
    async getInfo(): Promise<SandboxInfo> {
        return fetchInfo(this.conn.client, this.sandboxId);
    }

    /** True when the sandbox is running right now. The sandbox API. */
    async isRunning(): Promise<boolean> {
        return (await this.getInfo()).state === "SANDBOX_STATE_RUNNING";
    }

    /** Pauses the sandbox. The sandbox API. */
    async pause(): Promise<SandboxInfo> {
        return pauseSandbox(this.conn.client, this.sandboxId);
    }

    /** Resumes a paused sandbox. The sandbox API. */
    async resume(): Promise<SandboxInfo> {
        return resumeSandbox(this.conn.client, this.sandboxId);
    }

    /** Starts a snapshot of this sandbox. The sandbox API. Resolves in `CREATING`: call `snapshot.waitUntilReady()`. */
    createSnapshot(opts: SnapshotCreateOptions = {}): Promise<Snapshot> {
        return createSnapshot(this.conn, this.sandboxId, opts, "box.createSnapshot");
    }

    /**
     * Deletes the sandbox through the sandbox API. Resolves `false` when it is already gone. This does not
     * delete the session or the config saved for its manifest (and so does not revoke the managed key): for that
     * call `box.agent.destroy()`, or use `await using`.
     */
    kill(): Promise<boolean> {
        return deleteSandbox(this.conn.client, this.sandboxId);
    }

    /**
     * The same as {@link kill}. `purgeHistory` is refused: the sandbox API cannot purge a session's records.
     */
    async delete(opts: { purgeHistory?: boolean } = {}): Promise<boolean> {
        if (opts.purgeHistory) throw new UnsupportedError("box.delete: `purgeHistory` is not supported: the sandbox API cannot purge a session's records");
        return this.kill();
    }

    /**
     * `await using box = await Sandbox.create({ agent })` destroys the session at the end of the scope, which is
     * the harness API: it deletes the sandbox and the config saved for the manifest, and revokes the managed key.
     */
    async [Symbol.asyncDispose](): Promise<void> {
        try {
            await viaHarness(() => this.harnessSession[Symbol.asyncDispose]());
        } catch (err) {
            if (!(err instanceof NotFoundError)) throw err;
        }
    }
}
