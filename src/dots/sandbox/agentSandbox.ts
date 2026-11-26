/**
 * A sandbox created from an agent manifest: a Harness Runtime session with an agent in it.
 *
 * It uses the harness API (`/v2/harness-runtime/sessions/{sessionId}`) for every call, and never the sandbox
 * API: its `sandboxId` is informational (a rollback replaces it). A bare `Sandbox` is the mirror image and
 * has no session operations. `kind` tells the two apart.
 *
 * ```ts
 * await using box = await Sandbox.create({ manifest });
 * await box.exec("pytest -x", { check: true });
 * await box.run("Fix the failing test");
 * ```
 */

import type { Session } from "../harnessRuntime/session.js";
import type { TriggerHandle } from "../harnessRuntime/triggers.js";
import { rejectUnknownOptions, type Connection } from "./config.js";
import { CommandError, NotFoundError, SandboxError, viaHarness } from "./errors.js";
import { parseDuration, type ExecCallOptions, type ExecCommand, type ExecResult } from "./exec.js";
import {
    checkTriggerRequest,
    createTrigger,
    type CronSchedule,
    type TriggerBase,
    type WebhookSchedule,
    type WebhookTriggerResult,
} from "./triggers.js";

const EXEC_KEYS = ["cwd", "envVars", "env", "timeoutSeconds", "timeout", "stdin", "signal", "onStdout", "onStderr", "check"];

/**
 * The agent in an agent session: `box.agent()`. Talks to the agent only, through the harness API. The sandbox
 * calls (`exec`, `files`) stay on the {@link AgentSandbox} and do not wait for a run.
 */
export class AgentHandle {
    /** @internal Use `box.agent()`. */
    constructor(private readonly session: Session) {}

    /** Sends a prompt and resolves when the turn ends. `onText` streams the answer, `onApproval` answers requests. */
    run(text: string, options?: Parameters<Session["run"]>[1]): ReturnType<Session["run"]> {
        return viaHarness(() => this.session.run(text, options));
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

export class AgentSandbox {
    /** Tells this apart from a bare {@link Sandbox}, which has `kind: "sandbox"`. */
    readonly kind = "session" as const;

    /** The harness `Session`: `spawn` with live stdin, checkpoints, forks, approvals, port forwarding. */
    readonly session: Session;

    /** Copy files in and out of `/workspace`: `upload`, `download`, `downloadText`, `copyFromLocal`, `copyToLocal`. */
    readonly files: Session["files"];

    private readonly conn: Connection;

    /** @internal Use `Sandbox.create({ agent })`, `Sandbox.create({ manifest })` or `Sandbox.getSession(id)`. */
    constructor(session: Session, conn: Connection) {
        this.conn = conn;
        this.session = session;
        this.files = session.files;
    }

    get sessionId(): string {
        return this.session.id;
    }
    /** Informational: it can be empty until a sandbox is allocated, and a rollback replaces it. */
    get sandboxId(): string {
        return this.session.info.sandboxId ?? "";
    }
    /** The raw session status, such as `SESSION_STATUS_READY`. */
    get status(): string | undefined {
        return this.session.status;
    }

    /** The agent in this session: `run`, `send`, `events`, `history`, `cancel` and `resolveApproval`. */
    agent(): AgentHandle {
        return new AgentHandle(this.session);
    }

    /**
     * Runs this session's agent on a schedule or from a webhook. The trigger is bound to this session: each run
     * resumes it, so the agent keeps its files and history. A bound session must be paused when a run fires and
     * is best treated as dedicated to the trigger, because messaging it or any call that resumes it wakes it.
     * Pass `pause: true` to pause it first. Without `pause`, a session that is still awake is for the API to
     * accept or reject. `cron` returns the trigger; `webhook` returns `{ trigger, setup }`, where `setup` holds the
     * URL and the signing secret, which is shown only once.
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
        if (pause) await this.pause();
        return createTrigger(this.conn, { session: this.sessionId }, request);
    }

    /** Reads the session again. */
    async getInfo(): Promise<this> {
        await viaHarness(() => this.session.refresh());
        return this;
    }

    async waitUntilReady(opts: { timeoutMs?: number } = {}): Promise<this> {
        await viaHarness(() => this.session.waitUntilReady(opts));
        return this;
    }

    /**
     * Runs a command and waits for it to exit. Takes the options and returns the result of a bare sandbox's
     * `exec`. A string runs as `sh -c <command>` (the harness API's shell), an array runs as given. A non-zero
     * exit is returned, not thrown, unless `check` is set. There is no PTY or live stdin here: use
     * `box.session.spawn(cmd, { stdin: true })` for live stdin.
     */
    async exec(command: ExecCommand, opts: ExecCallOptions = {}): Promise<ExecResult & { truncated: boolean }> {
        rejectUnknownOptions(opts, EXEC_KEYS, "exec");
        if (opts.env && opts.envVars) throw new SandboxError("exec: pass `env` or `envVars`, not both");
        if (opts.timeout !== undefined && opts.timeoutSeconds !== undefined) {
            throw new SandboxError("exec: pass `timeout` or `timeoutSeconds`, not both");
        }
        const seconds = opts.timeout !== undefined ? parseDuration(opts.timeout, "exec") : opts.timeoutSeconds;
        const r = await viaHarness(() =>
            this.session.exec(command, {
                cwd: opts.cwd,
                env: opts.env ?? opts.envVars,
                stdin: opts.stdin,
                timeoutMs: seconds ? seconds * 1000 : undefined,
                onStdout: opts.onStdout,
                onStderr: opts.onStderr,
                signal: opts.signal,
            }),
        );
        const result = { exitCode: r.exitCode, ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr, durationMs: r.durationMs ?? 0, truncated: r.truncated };
        if (opts.check && !result.ok) throw new CommandError(`command exited with code ${result.exitCode}`, result);
        return result;
    }

    /** Runs the agent on a prompt and resolves when the turn ends. See the harness `Session.run`. */
    run(text: string, options?: Parameters<Session["run"]>[1]): ReturnType<Session["run"]> {
        return this.agent().run(text, options);
    }

    /** Sends a prompt without waiting. Resolves the run id. Same as `box.agent().send`. */
    send(text: string): Promise<string> {
        return this.agent().send(text);
    }

    /** The live event stream. Same as `box.agent().events`. */
    events(options?: Parameters<Session["events"]>[0]): ReturnType<Session["events"]> {
        return this.agent().events(options);
    }

    pause(): Promise<void> {
        return viaHarness(() => this.session.pause());
    }

    resume(): Promise<void> {
        return viaHarness(() => this.session.resume());
    }

    /**
     * Destroys the session and its sandbox, and deletes the config saved for the manifest (which revokes the
     * managed key). Resolves `false` when it is already gone.
     */
    async kill(): Promise<boolean> {
        try {
            await viaHarness(() => this.session.destroy());
            return true;
        } catch (err) {
            if (err instanceof NotFoundError) return false;
            throw err;
        }
    }

    /** `await using box = await Sandbox.create({ manifest })` kills it at the end of the scope. */
    async [Symbol.asyncDispose](): Promise<void> {
        await viaHarness(() => this.session[Symbol.asyncDispose]());
    }
}
