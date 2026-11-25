/**
 * Commands running in a sandbox: `/v2/sandboxes/{id}/commands`.
 *
 * JSON calls go through the generated client. The attach stream cannot:
 * Kiota resolves a response only when its body closes, and an attach stays open
 * while the command runs. That one call reuses the streaming helpers
 * (`prepareRequest`, `openStream`) so it sends the same authenticated request.
 *
 * ```ts
 * const result = await sandbox.commands.run('echo "Hello"');
 * console.log(result.stdout, result.exitCode);
 *
 * const cmd = await sandbox.commands.start("sleep", { args: ["60"] });
 * await cmd.kill();
 * ```
 */

import { Sandbox_command_signalObject } from "../models/index.js";
import { HttpMethod, openStream, prepareRequest } from "../streaming/harnessStream.js";
import { StreamRequestBuilderUriTemplate } from "../v2/sandboxes/item/commands/item/stream/index.js";
import type { Connection } from "./config.js";
import { call, NotFoundError, SandboxError, toSandboxError } from "./errors.js";
import { readJsonObjects } from "./jsonStream.js";

export { JsonObjectReader } from "./jsonStream.js";

/** A command that is running in a sandbox. */
export interface CommandInfo {
    pid: number;
    cmd: string;
    cwd?: string;
}

/** Options for {@link Commands.start}. */
export interface CommandStartOptions {
    /** Arguments passed to the executable. */
    args?: string[];
    /** Working directory. */
    cwd?: string;
    /** Environment variables for the command. */
    envVars?: Record<string, string>;
    /** Leave stdin open, so {@link Command.writeStdin} can write to it. */
    stdin?: boolean;
    /** Kill the command after this long. Omit or 0 for no timeout. */
    timeoutSeconds?: number;
}

/** Options for {@link Commands.run}. */
export interface CommandRunOptions extends Omit<CommandStartOptions, "args" | "stdin"> {
    /** Called with each chunk of stdout as it arrives. */
    onStdout?: (text: string) => void;
    /** Called with each chunk of stderr as it arrives. */
    onStderr?: (text: string) => void;
    /** Stops waiting. The command keeps running; {@link Command.kill} stops it. */
    signal?: AbortSignal;
}

/** Options for {@link Command.wait} and {@link Command.stream}. */
export interface CommandAttachOptions {
    /** Called with each chunk of stdout as it arrives. */
    onStdout?: (text: string) => void;
    /** Called with each chunk of stderr as it arrives. */
    onStderr?: (text: string) => void;
    /** Stops waiting. The command keeps running. */
    signal?: AbortSignal;
}

/** The outcome of a command that exited. A non-zero `exitCode` is not an error. */
export interface CommandResult {
    pid: number;
    exitCode: number;
    stdout: string;
    stderr: string;
    /** A short status for the exit, such as `exited`. */
    status?: string;
    /** Set when the process failed abnormally. */
    error?: string;
}

/** One event of a command's output. */
export type CommandEvent =
    | { type: "started"; pid: number }
    | { type: "stdout"; data: Uint8Array; text: string }
    | { type: "stderr"; data: Uint8Array; text: string }
    | { type: "exit"; exitCode: number; status?: string; error?: string };

/** The signals `kill` can send. */
export type CommandSignal = "SIGTERM" | "SIGKILL";

const SIGNALS: Record<CommandSignal, string> = {
    SIGTERM: Sandbox_command_signalObject.SANDBOX_COMMAND_SIGNAL_SIGTERM,
    SIGKILL: Sandbox_command_signalObject.SANDBOX_COMMAND_SIGNAL_SIGKILL,
};

/** Starts commands in one sandbox and finds the ones already running. */
export class Commands {
    /** @internal */
    constructor(
        private readonly conn: Connection,
        private readonly sandboxId: string,
    ) {}

    private get item() {
        return this.conn.client.v2.sandboxes.bySandbox_id(this.sandboxId).commands;
    }

    /**
     * Starts an executable and returns once it is running. It keeps running
     * after this call returns. For a shell string use {@link run}, or pass
     * `"bash"` with `args: ["-lc", "..."]`.
     */
    async start(cmd: string, opts: CommandStartOptions = {}): Promise<Command> {
        if (!cmd?.trim()) throw new SandboxError("commands.start: `cmd` is required");
        const res = await call(() =>
            this.item.post({
                cmd,
                args: opts.args,
                cwd: opts.cwd,
                envVars: opts.envVars ? { additionalData: { ...opts.envVars } } : undefined,
                stdin: opts.stdin,
                timeoutSeconds: opts.timeoutSeconds ? String(opts.timeoutSeconds) : undefined,
            }),
        );
        if (res?.pid === undefined || res.pid === null) {
            throw new SandboxError("the API response did not include the command's pid");
        }
        return new Command(this.conn, this.sandboxId, res.pid);
    }

    /**
     * Runs a shell command (`bash -lc <command>`) and waits for it to exit.
     * A non-zero exit code is returned in the result, not thrown.
     *
     * Output is only readable while the command runs, so a command that exits
     * before the stream attaches fails with {@link NotFoundError}.
     */
    async run(command: string, opts: CommandRunOptions = {}): Promise<CommandResult> {
        const { onStdout, onStderr, signal, ...start } = opts;
        const cmd = await this.start("bash", { ...start, args: ["-lc", command] });
        return cmd.wait({ onStdout, onStderr, signal });
    }

    /** Lists the commands that are running. */
    async list(): Promise<CommandInfo[]> {
        const res = await call(() => this.item.get());
        return (res?.commands ?? []).map((c) => ({
            pid: Number(c.pid),
            cmd: c.cmd ?? "",
            cwd: c.cwd ?? undefined,
        }));
    }

    /** A handle on a command that is already running. Makes no request. */
    connect(pid: number): Command {
        return new Command(this.conn, this.sandboxId, pid);
    }
}

/** A command in a sandbox: read its output, write its stdin, stop it. */
export class Command {
    /** @internal */
    constructor(
        private readonly conn: Connection,
        private readonly sandboxId: string,
        readonly pid: number,
    ) {}

    private get item() {
        return this.conn.client.v2.sandboxes.bySandbox_id(this.sandboxId).commands.byPid(this.pid);
    }

    /**
     * The command's events as they happen: `started`, `stdout`, `stderr` and a
     * final `exit`. Keepalives are dropped. Leave the loop to disconnect; the
     * command keeps running.
     */
    async *stream(opts: { signal?: AbortSignal } = {}): AsyncGenerator<CommandEvent> {
        let exited = false;
        for await (const event of this.attach(opts.signal)) {
            yield event;
            if (event.type === "exit") exited = true;
        }
        if (!exited && !opts.signal?.aborted) {
            throw new SandboxError(
                `the stream for command ${this.pid} ended before the command exited; its outcome is unknown`,
            );
        }
    }

    /** Waits for the command to exit and returns its output and exit code. */
    async wait(opts: CommandAttachOptions = {}): Promise<CommandResult> {
        const out = new TextDecoder();
        const err = new TextDecoder();
        let stdout = "";
        let stderr = "";
        for await (const event of this.stream({ signal: opts.signal })) {
            if (event.type === "stdout") {
                const text = out.decode(event.data, { stream: true });
                stdout += text;
                if (text) opts.onStdout?.(text);
            } else if (event.type === "stderr") {
                const text = err.decode(event.data, { stream: true });
                stderr += text;
                if (text) opts.onStderr?.(text);
            } else if (event.type === "exit") {
                return {
                    pid: this.pid,
                    exitCode: event.exitCode,
                    stdout: stdout + out.decode(),
                    stderr: stderr + err.decode(),
                    status: event.status,
                    error: event.error,
                };
            }
        }
        throw new SandboxError(`stopped waiting for command ${this.pid} before it exited`);
    }

    /** Sends a signal to the command. Defaults to `SIGTERM`. */
    async kill(signal: CommandSignal = "SIGTERM"): Promise<void> {
        if (!(signal in SIGNALS)) {
            throw new SandboxError(`commands: unsupported signal ${signal}: expected SIGTERM or SIGKILL`);
        }
        await call(() => this.item.signal.post({ signal: SIGNALS[signal] as never }));
    }

    /**
     * Writes to the command's stdin. The command must have been started with
     * `stdin: true`. Pass `eof: true` to close stdin after writing.
     */
    async writeStdin(data: string | Uint8Array, opts: { eof?: boolean } = {}): Promise<void> {
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        await call(() => this.item.stdin.post({ data: buffer, eof: opts.eof }));
    }

    /** Closes the command's stdin. */
    async closeStdin(): Promise<void> {
        await call(() => this.item.stdin.post({ eof: true }));
    }

    private async *attach(signal?: AbortSignal): AsyncGenerator<CommandEvent> {
        let body: ReadableStream<Uint8Array>;
        try {
            const request = await prepareRequest(
                HttpMethod.GET,
                StreamRequestBuilderUriTemplate,
                { sandbox_id: this.sandboxId, pid: this.pid },
                {},
                { ...this.conn.transport, signal },
                { Accept: "application/json" },
            );
            const response = await openStream(request, { method: "GET" }, { ...this.conn.transport, signal });
            body = response.body!;
        } catch (err) {
            const converted = toSandboxError(err);
            if (converted instanceof NotFoundError) {
                throw new NotFoundError(
                    `command ${this.pid} not found or already exited: output can only be read while it runs`,
                    converted.status,
                    converted.code,
                    converted.requestId,
                );
            }
            throw converted;
        }

        for await (const raw of readJsonObjects(body, signal)) {
            const event = toEvent(raw);
            if (event) yield event;
        }
    }
}

/** Decodes one `{result}` or `{error}` envelope. Keepalives and unknown events are dropped. */
function toEvent(raw: any): CommandEvent | undefined {
    if (raw?.error) {
        const e = raw.error;
        throw new SandboxError(e.message ?? "the command stream failed", Number(e.http_code ?? 0));
    }
    const r = raw?.result;
    if (!r) return undefined;
    if (r.started) return { type: "started", pid: Number(r.started.pid) };
    if (typeof r.stdout === "string" && r.stdout !== "") return output("stdout", r.stdout);
    if (typeof r.stderr === "string" && r.stderr !== "") return output("stderr", r.stderr);
    if (r.exit) {
        return {
            type: "exit",
            exitCode: Number(r.exit.exit_code ?? 0),
            status: r.exit.status || undefined,
            error: r.exit.error || undefined,
        };
    }
    return undefined;
}

function output(type: "stdout" | "stderr", base64: string): CommandEvent {
    const data = new Uint8Array(Buffer.from(base64, "base64"));
    return { type, data, text: new TextDecoder().decode(data) };
}
