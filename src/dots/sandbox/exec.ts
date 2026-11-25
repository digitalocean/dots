/**
 * Exec in a sandbox: `/v2/sandboxes/{id}/exec`.
 *
 * One request starts the process and streams its output back, so unlike
 * `commands.run` there is no window in which a short command can exit before
 * its output is attached. Prefer `exec.run` for short commands.
 *
 * The start stream cannot go through the generated client: Kiota resolves a
 * response only when its body closes. It reuses the streaming helpers
 * (`prepareRequest`, `openStream`) so it sends the same authenticated request.
 * Stdin writes and resizes are plain JSON calls through the generated client.
 *
 * ```ts
 * const result = await sandbox.exec.run("echo hello; exit 3");
 * console.log(result.stdout, result.exitCode); // "hello\n" 3
 *
 * const session = await sandbox.exec.start(["cat"]);
 * await session.writeStdin("hi\n");
 * await session.closeStdin();
 * console.log((await session.wait()).stdout); // "hi\n"
 * ```
 */

import { HttpMethod, openStream, prepareRequest } from "../streaming/harnessStream.js";
import { ExecRequestBuilderUriTemplate } from "../v2/sandboxes/item/exec/index.js";
import { rejectUnknownOptions, type Connection } from "./config.js";
import { call, errorForStatus, SandboxError, toSandboxError } from "./errors.js";
import { readJsonObjects } from "./jsonStream.js";

/** What to run: a shell string (run as `bash -lc <command>`) or an argv array run as is. */
export type ExecCommand = string | string[];

/** The pseudo-terminal for {@link Exec.start}. */
export interface ExecPtyOptions {
    /** Terminal rows, 1 to 1000. */
    rows?: number;
    /** Terminal columns, 1 to 1000. */
    cols?: number;
    /** The `TERM` value, such as `xterm-256color`. */
    term?: string;
}

interface ExecBaseOptions {
    /** Working directory. */
    cwd?: string;
    /** Environment variables for the process. */
    envVars?: Record<string, string>;
    /** Kill the process after this many seconds. Omit or 0 for no timeout. */
    timeoutSeconds?: number;
    /** The first chunk of stdin, sent with the start request. A string is sent as UTF-8. */
    stdin?: string | Uint8Array;
    /** Disconnects the stream. The process may keep running. */
    signal?: AbortSignal;
}

/** Options for {@link Exec.run}. */
export interface ExecRunOptions extends ExecBaseOptions {
    /** Called with each chunk of stdout as it arrives. */
    onStdout?: (text: string) => void;
    /** Called with each chunk of stderr as it arrives. */
    onStderr?: (text: string) => void;
}

/** Options for {@link Exec.start}. */
export interface ExecStartOptions extends ExecBaseOptions {
    /** Keep stdin open for {@link ExecSession.writeStdin}. Defaults to true. */
    keepStdinOpen?: boolean;
    /**
     * Allocate a pseudo-terminal. `true` or `{}` uses the defaults. With a PTY,
     * an empty or omitted command starts the guest's default shell.
     */
    pty?: boolean | ExecPtyOptions;
}

/** Options for {@link ExecSession.wait}. */
export interface ExecWaitOptions {
    /** Called with each chunk of stdout as it arrives. */
    onStdout?: (text: string) => void;
    /** Called with each chunk of stderr as it arrives. */
    onStderr?: (text: string) => void;
}

/** The outcome of a process that exited. A non-zero `exitCode` is not an error. */
export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    /** How long the process ran, in milliseconds. */
    durationMs: number;
    /** A short status for the exit, when the API sends one. */
    status?: string;
    /** Set when the process failed abnormally. */
    error?: string;
}

/**
 * One event of an exec stream. `text` is decoded with a streaming UTF-8
 * decoder, so a character split across chunks is not broken.
 */
export type ExecEvent =
    | { type: "started"; execId: string }
    | { type: "stdout"; data: Uint8Array; text: string }
    | { type: "stderr"; data: Uint8Array; text: string }
    | { type: "exit"; exitCode: number; durationMs: number; status?: string; error?: string };

const BASE_KEYS = ["cwd", "envVars", "timeoutSeconds", "stdin", "signal"];
const RUN_KEYS = [...BASE_KEYS, "onStdout", "onStderr"];
const START_KEYS = [...BASE_KEYS, "keepStdinOpen", "pty"];
const PTY_KEYS = ["rows", "cols", "term"];

/** Runs processes in one sandbox and streams their output. */
export class Exec {
    /** @internal */
    constructor(
        private readonly conn: Connection,
        private readonly sandboxId: string,
    ) {}

    /**
     * Runs a command and waits for it to exit. A string runs as
     * `bash -lc <command>`; an array is the argv. A non-zero exit code is
     * returned in the result, not thrown.
     */
    async run(command: ExecCommand, opts: ExecRunOptions = {}): Promise<ExecResult> {
        rejectUnknownOptions(opts, RUN_KEYS, "exec.run");
        const { onStdout, onStderr, ...start } = opts;
        const session = await this.open("exec.run", command, { ...start, keepStdinOpen: false });
        return session.wait({ onStdout, onStderr });
    }

    /**
     * Starts a process for interactive use and returns once its stream is open.
     * With stdin kept open (the default) or a PTY, it also waits for the
     * `started` event, so {@link ExecSession.execId} is set.
     */
    async start(command?: ExecCommand, opts: ExecStartOptions = {}): Promise<ExecSession> {
        rejectUnknownOptions(opts, START_KEYS, "exec.start");
        return this.open("exec.start", command, { ...opts, keepStdinOpen: opts.keepStdinOpen ?? true });
    }

    private async open(where: string, command: ExecCommand | undefined, opts: ExecStartOptions): Promise<ExecSession> {
        const body = buildStartBody(where, command, opts);
        const interactive = body.keep_stdin_open === true || body.pty !== undefined;

        const controller = new AbortController();
        const outer = opts.signal;
        const onAbort = () => controller.abort(outer?.reason);
        if (outer?.aborted) controller.abort(outer.reason);
        else outer?.addEventListener("abort", onAbort, { once: true });
        const transport = { ...this.conn.transport, signal: controller.signal };

        let stream: ReadableStream<Uint8Array>;
        try {
            const request = await prepareRequest(
                HttpMethod.POST,
                ExecRequestBuilderUriTemplate,
                { sandbox_id: this.sandboxId },
                {},
                transport,
                { Accept: "application/json", "Content-Type": "application/json" },
            );
            const response = await openStream(request, { method: "POST", body: JSON.stringify(body) }, transport);
            const type = (response.headers.get("content-type") ?? "").toLowerCase();
            if (type && !type.includes("json")) {
                const text = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);
                throw errorForStatus(
                    response.status,
                    `unexpected ${type.split(";")[0]} response (HTTP ${response.status}) from POST ${request.url}${text ? `: ${text}` : ""}`,
                );
            }
            stream = response.body!;
        } catch (err) {
            outer?.removeEventListener("abort", onAbort);
            throw toSandboxError(err);
        }

        const session = new ExecSession(this.conn, this.sandboxId, stream, controller, () =>
            outer?.removeEventListener("abort", onAbort),
        );
        if (interactive) await session.readUntilStarted();
        return session;
    }
}

/**
 * A process started by {@link Exec.start}: read its events, write its stdin,
 * resize its terminal. The stream has a single consumer: use either
 * {@link events} or {@link wait}, once.
 */
export class ExecSession implements AsyncIterable<ExecEvent> {
    /** Set once the `started` event arrives: with stdin kept open or a PTY. */
    execId?: string;

    private readonly source: AsyncGenerator<ExecEvent>;
    private readonly early: ExecEvent[] = [];
    private consumed = false;
    private offset = 0;
    private writes: Promise<unknown> = Promise.resolve();

    /** @internal */
    constructor(
        private readonly conn: Connection,
        private readonly sandboxId: string,
        body: ReadableStream<Uint8Array>,
        private readonly controller: AbortController,
        private readonly cleanup: () => void,
    ) {
        this.source = toEvents(readJsonObjects(body, controller.signal));
    }

    /** @internal Reads events until `started`, keeping them all for the consumer. */
    async readUntilStarted(): Promise<void> {
        try {
            for (;;) {
                const next = await this.source.next();
                if (next.done) return;
                this.early.push(next.value);
                if (next.value.type === "started") {
                    this.execId = next.value.execId;
                    return;
                }
                if (next.value.type === "exit") return;
            }
        } catch (err) {
            this.close();
            throw toSandboxError(err);
        }
    }

    /**
     * The process's events as they happen: `started` (when stdin is kept open
     * or a PTY is used), `stdout`, `stderr` and a final `exit`. Keepalives are
     * dropped. Leave the loop or call {@link close} to disconnect.
     */
    async *events(): AsyncGenerator<ExecEvent> {
        if (this.consumed) throw new SandboxError("exec: the session's events can only be read once");
        this.consumed = true;
        let exited = false;
        try {
            while (this.early.length) {
                const event = this.early.shift()!;
                yield event;
                if (event.type === "exit") exited = true;
            }
            if (!exited) {
                for await (const event of this.source) {
                    yield event;
                    if (event.type === "exit") {
                        exited = true;
                        break;
                    }
                }
            }
            if (!exited && !this.controller.signal.aborted) {
                throw new SandboxError("the exec stream ended before the process exited; its outcome is unknown");
            }
        } catch (err) {
            throw toSandboxError(err);
        } finally {
            this.cleanup();
            if (!exited) this.controller.abort();
        }
    }

    [Symbol.asyncIterator](): AsyncGenerator<ExecEvent> {
        return this.events();
    }

    /** Waits for the process to exit and returns its output and exit code. */
    async wait(opts: ExecWaitOptions = {}): Promise<ExecResult> {
        let stdout = "";
        let stderr = "";
        for await (const event of this.events()) {
            if (event.type === "stdout") {
                stdout += event.text;
                if (event.text) opts.onStdout?.(event.text);
            } else if (event.type === "stderr") {
                stderr += event.text;
                if (event.text) opts.onStderr?.(event.text);
            } else if (event.type === "exit") {
                return {
                    exitCode: event.exitCode,
                    stdout,
                    stderr,
                    durationMs: event.durationMs,
                    status: event.status,
                    error: event.error,
                };
            }
        }
        throw new SandboxError("stopped waiting for the exec before the process exited");
    }

    /**
     * Writes to the process's stdin. Pass `eof: true` to close stdin after
     * writing. Concurrent writes are sent one at a time, in call order.
     */
    async writeStdin(data: string | Uint8Array, opts: { eof?: boolean } = {}): Promise<void> {
        rejectUnknownOptions(opts, ["eof"], "exec.writeStdin");
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        await this.send(bytes, opts.eof);
    }

    /** Closes the process's stdin. */
    async closeStdin(): Promise<void> {
        await this.send(undefined, true);
    }

    /** Resizes the PTY. `rows` and `cols` are 1 to 1000. */
    async resize(rows: number, cols: number): Promise<void> {
        checkSize("exec.resize: `rows`", rows);
        checkSize("exec.resize: `cols`", cols);
        const execId = this.requireExecId("resize");
        await call(() => this.item(execId).resize.post({ rows, cols }));
    }

    /** Disconnects the stream. The process may keep running. */
    close(): void {
        this.cleanup();
        this.controller.abort();
    }

    private item(execId: string) {
        return this.conn.client.v2.sandboxes.bySandbox_id(this.sandboxId).exec.byExec_id(execId);
    }

    private requireExecId(what: string): string {
        if (!this.execId) {
            throw new SandboxError(
                `exec.${what}: the session has no exec id; start it with keepStdinOpen or pty`,
            );
        }
        return this.execId;
    }

    private send(bytes: Uint8Array | undefined, eof: boolean | undefined): Promise<void> {
        const execId = this.requireExecId(eof && !bytes ? "closeStdin" : "writeStdin");
        const run = async () => {
            const data =
                bytes && bytes.byteLength
                    ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
                    : undefined;
            const res = await call(() =>
                this.item(execId).stdin.post({ data, offset: String(this.offset), eof: eof || undefined }),
            );
            const accepted = Number(res?.offset ?? this.offset + (bytes?.byteLength ?? 0));
            if (Number.isFinite(accepted)) this.offset = accepted;
        };
        const next = this.writes.then(run, run);
        this.writes = next.catch(() => undefined);
        return next;
    }
}

function checkSize(what: string, n: unknown): void {
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 1000) {
        throw new SandboxError(`${what} must be an integer from 1 to 1000`);
    }
}

function toBase64(data: string | Uint8Array): string {
    return Buffer.from(typeof data === "string" ? new TextEncoder().encode(data) : data).toString("base64");
}

/** Validates the options and builds the snake_case start body. */
function buildStartBody(where: string, command: ExecCommand | undefined, opts: ExecStartOptions): Record<string, unknown> {
    const pty = opts.pty === true ? {} : opts.pty === false ? undefined : opts.pty;
    let argv: string[] | undefined;
    if (typeof command === "string") {
        if (command.trim()) argv = ["bash", "-lc", command];
    } else if (Array.isArray(command)) {
        if (command.some((a) => typeof a !== "string")) throw new SandboxError(`${where}: argv must be strings`);
        if (command.length) argv = [...command];
    } else if (command !== undefined && command !== null) {
        throw new SandboxError(`${where}: \`command\` must be a string or an argv array`);
    }
    if (argv && !argv[0]?.trim()) throw new SandboxError(`${where}: argv[0] must not be empty`);
    if (!argv && !pty) throw new SandboxError(`${where}: \`command\` is required`);

    if (opts.envVars) {
        for (const key of Object.keys(opts.envVars)) {
            if (!key.trim()) throw new SandboxError(`${where}: environment variable names must not be empty`);
        }
    }
    const t = opts.timeoutSeconds;
    if (t !== undefined && (!Number.isInteger(t) || t < 0)) {
        throw new SandboxError(`${where}: \`timeoutSeconds\` must be a non-negative integer`);
    }
    if (pty) {
        if (typeof pty !== "object") throw new SandboxError(`${where}: \`pty\` must be true or an object`);
        rejectUnknownOptions(pty, PTY_KEYS, `${where}: pty`);
        if (pty.rows !== undefined) checkSize(`${where}: \`pty.rows\``, pty.rows);
        if (pty.cols !== undefined) checkSize(`${where}: \`pty.cols\``, pty.cols);
    }

    const body: Record<string, unknown> = {};
    if (argv) body.argv = argv;
    if (opts.cwd) body.workdir = opts.cwd;
    if (opts.envVars && Object.keys(opts.envVars).length) body.env_vars = { ...opts.envVars };
    if (t !== undefined) body.timeout_seconds = String(t);
    if (opts.keepStdinOpen) body.keep_stdin_open = true;
    if (pty) {
        const p: Record<string, unknown> = {};
        if (pty.rows !== undefined) p.rows = pty.rows;
        if (pty.cols !== undefined) p.cols = pty.cols;
        if (pty.term) p.term = pty.term;
        body.pty = p;
    }
    if (opts.stdin !== undefined && opts.stdin !== null) {
        if (typeof opts.stdin !== "string" && !(opts.stdin instanceof Uint8Array)) {
            throw new SandboxError(`${where}: \`stdin\` must be a string or a Uint8Array`);
        }
        body.stdin = toBase64(opts.stdin);
    }
    return body;
}

/** The wire shape of one stream envelope. Protobuf JSON omits zero values. */
interface RawEnvelope {
    error?: { http_code?: number | string; message?: string };
    result?: {
        started?: { exec_id?: string };
        stdout?: string;
        stderr?: string;
        exit?: { exit_code?: number; duration_ms?: string | number; status?: string; error?: string };
    };
}

/** Decodes `{result}` / `{error}` envelopes into events. Keepalives and unknown events are dropped. */
async function* toEvents(objects: AsyncGenerator<unknown>): AsyncGenerator<ExecEvent> {
    const out = new TextDecoder();
    const err = new TextDecoder();
    for await (const raw of objects as AsyncGenerator<RawEnvelope | undefined>) {
        if (raw?.error) {
            const e = raw.error;
            throw new SandboxError(e.message ?? "the exec stream failed", Number(e.http_code ?? 0));
        }
        const r = raw?.result;
        if (!r) continue;
        if (r.started) {
            yield { type: "started", execId: String(r.started.exec_id ?? "") };
        } else if (typeof r.stdout === "string" && r.stdout !== "") {
            const data = new Uint8Array(Buffer.from(r.stdout, "base64"));
            yield { type: "stdout", data, text: out.decode(data, { stream: true }) };
        } else if (typeof r.stderr === "string" && r.stderr !== "") {
            const data = new Uint8Array(Buffer.from(r.stderr, "base64"));
            yield { type: "stderr", data, text: err.decode(data, { stream: true }) };
        } else if (r.exit) {
            const tailOut = out.decode();
            const tailErr = err.decode();
            if (tailOut) yield { type: "stdout", data: new Uint8Array(), text: tailOut };
            if (tailErr) yield { type: "stderr", data: new Uint8Array(), text: tailErr };
            yield {
                type: "exit",
                exitCode: Number(r.exit.exit_code ?? 0),
                durationMs: Number(r.exit.duration_ms ?? 0),
                status: r.exit.status || undefined,
                error: r.exit.error || undefined,
            };
        }
    }
}
