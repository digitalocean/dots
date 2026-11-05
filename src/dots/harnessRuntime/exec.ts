/**
 * Running commands in a session's sandbox: buffered, streamed, or as a
 * process you keep writing to.
 *
 * CONTRACT RISK — read before changing this file.
 *
 * Only buffered exec (a JSON response once the command exits) is in the
 * published API spec. The other two modes are built ahead of the spec:
 *
 * - Streaming output (`Accept: text/event-stream` on the exec route) is live
 *   on the server but not yet published. The event shapes below (`stdout` and
 *   `stderr` carrying `{"data": "<base64>"}`, `exit` carrying `exit_code` and
 *   `duration_ms`, `error` carrying `message`) are taken from the server's
 *   implementation as of November 2026.
 * - Live stdin (`spawn`) is NOT deployed yet. It follows the server team's
 *   implementation plan as of November 2026: the start call sends
 *   `keep_stdin_open: true` and the stream opens with `event: started`
 *   carrying `exec_id`; each write is `POST .../sandbox/exec/{exec_id}/stdin`
 *   with `{data, offset}` or `{eof: true, offset}`, answered with the new
 *   `offset`. The plan lists these names as still open, so they may change
 *   before they are published.
 *
 * When the spec publishes either mode, check these shapes against it and
 * remove this note. Until then `spawn` is a preview.
 */

import { HeadersInspectionOptions } from "@microsoft/kiota-http-fetchlibrary";
import { ExecRequestBuilderUriTemplate } from "../v2/agents/sessions/item/sandbox/exec/index.js";
import { HarnessStreamError, HttpMethod, openStream, prepareRequest } from "../streaming/harnessStream.js";
import { readSseFrames, type SseFrame } from "../streaming/sseFrames.js";
import { call, HarnessRuntimeError, required, toHarnessError } from "./errors.js";
import type { RuntimeContext } from "./session.js";

/** Not in the generated client yet; see the contract note above. */
const STDIN_URI_TEMPLATE = "{+baseurl}/v2/agents/sessions/{session_id}/sandbox/exec/{exec_id}/stdin";

/** The server refuses stdin bodies over 1 MiB; 512 KiB of bytes stays under it once base64-encoded. */
const STDIN_CHUNK_BYTES = 512 * 1024;

/** Options for {@link Session.exec}. */
export interface ExecOptions {
    /** Working directory. Defaults to `/workspace`. */
    cwd?: string;
    /** Sent to the command's stdin in full, then closed. For live stdin use `spawn`. */
    stdin?: string | Uint8Array;
    /**
     * How long the command may run. Buffered: 240 s by default and at most.
     * Streamed: 15 minutes by default and at most.
     */
    timeoutMs?: number;
    /** Streams stdout as it arrives. Setting this, `onStderr` or `signal` streams the call. */
    onStdout?: (text: string) => void;
    /** Streams stderr as it arrives. */
    onStderr?: (text: string) => void;
    /** Aborting stops the stream, and the server then cancels the command. */
    signal?: AbortSignal;
}

/** Options for {@link Session.spawn}. */
export type SpawnOptions = Pick<ExecOptions, "cwd" | "timeoutMs" | "onStdout" | "onStderr">;

/** The result of a command. */
export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    /** True when buffered stdout or stderr passed 1 MiB and was cut off. Streamed output is not cut off. */
    truncated: boolean;
    durationMs?: number;
}

type Command = string | string[];

const argvOf = (command: Command) => (typeof command === "string" ? ["sh", "-c", command] : command);
const bytesOf = (data: string | Uint8Array) => (typeof data === "string" ? new TextEncoder().encode(data) : data);
const timeoutSecondsOf = (ms?: number) => (ms ? Math.ceil(ms / 1000) : undefined);

/** Buffered exec, the one mode in the published spec. */
export async function execBuffered(
    ctx: RuntimeContext,
    sessionId: string,
    command: Command,
    options: ExecOptions,
): Promise<ExecResult> {
    const stdin = options.stdin === undefined ? undefined : bytesOf(options.stdin);
    // Truncation is reported only in response headers.
    const headers = new HeadersInspectionOptions({ inspectResponseHeaders: true });
    const res = await call(() =>
        ctx.client.v2.agents.sessions.bySession_id(sessionId).sandbox.exec.post(
            {
                argv: argvOf(command),
                workdir: options.cwd,
                stdin: stdin ? (stdin.slice().buffer as ArrayBuffer) : undefined,
                timeoutSeconds: timeoutSecondsOf(options.timeoutMs),
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

/** Streamed exec: output arrives through the callbacks while the command runs. */
export async function execStreamed(
    ctx: RuntimeContext,
    sessionId: string,
    command: Command,
    options: ExecOptions,
): Promise<ExecResult> {
    const stdin = options.stdin === undefined ? undefined : toBase64(bytesOf(options.stdin));
    const frames = await openExecStream(ctx, sessionId, { ...startBody(command, options), stdin }, options.signal);
    return readOutput(frames, options, options.signal);
}

/** Starts a command whose stdin stays open. Preview: see the contract note above. */
export async function spawn(
    ctx: RuntimeContext,
    sessionId: string,
    command: Command,
    options: SpawnOptions,
): Promise<ExecProcess> {
    const controller = new AbortController();
    const frames = await openExecStream(
        ctx,
        sessionId,
        { ...startBody(command, options), keep_stdin_open: true },
        controller.signal,
    );

    // The server sends `started` before anything else. A server without live
    // stdin ignores the flag and runs the command with stdin closed, so stop it.
    let first: IteratorResult<SseFrame>;
    do first = await frames.next();
    while (!first.done && !first.value.event);
    if (first.done || first.value.event !== "started") {
        controller.abort();
        await frames.return(undefined);
        throw new HarnessRuntimeError(
            "this API does not support live stdin yet (no exec id was returned); the command was cancelled",
            0,
        );
    }
    const execId = required((JSON.parse(first.value.data) as { exec_id?: string }).exec_id, "the exec id");
    const done = readOutput(frames, options, controller.signal);
    return new ExecProcess(ctx, sessionId, execId, done, controller);
}

/** A running command started with {@link Session.spawn}. */
export class ExecProcess {
    /** Bytes of stdin the server has accepted; every write must name it. */
    private offset = 0;
    /** Writes go one at a time, in order. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly ctx: RuntimeContext,
        private readonly sessionId: string,
        /** The server's id for this command. */
        readonly id: string,
        private readonly done: Promise<ExecResult>,
        private readonly controller: AbortController,
    ) {
        // Keeps an unawaited failure from crashing the process; wait() still sees it.
        done.catch(() => undefined);
    }

    /** Writes to the command's stdin. Writes are sent in the order they are made. */
    write(data: string | Uint8Array): Promise<void> {
        const bytes = bytesOf(data);
        return this.enqueue(async () => {
            for (let at = 0; at < bytes.length; at += STDIN_CHUNK_BYTES) {
                await this.post({ data: toBase64(bytes.subarray(at, at + STDIN_CHUNK_BYTES)) }, 3);
            }
        });
    }

    /** Closes stdin, so the command reads end of file. */
    closeStdin(): Promise<void> {
        // Not retried: a retried eof that had already landed is refused as a second eof.
        return this.enqueue(() => this.post({ eof: true }, 0));
    }

    /** Resolves when the command exits. A non-zero exit is returned, not thrown. */
    wait(): Promise<ExecResult> {
        return this.done;
    }

    /** Stops the command. `wait()` then rejects. */
    kill(): void {
        this.controller.abort();
    }

    private enqueue(op: () => Promise<void>): Promise<void> {
        const next = this.queue.then(op);
        this.queue = next.catch(() => undefined);
        return next;
    }

    /**
     * A write that fails on the network is retried with the same offset. The
     * server skips bytes it already has, so a lost response does not repeat them.
     */
    private async post(body: { data?: string; eof?: boolean }, retries: number): Promise<void> {
        for (let attempt = 0; ; attempt++) {
            try {
                const transport = this.ctx.transport;
                const request = await prepareRequest(
                    HttpMethod.POST,
                    STDIN_URI_TEMPLATE,
                    { session_id: this.sessionId, exec_id: this.id },
                    {},
                    transport,
                    { "Content-Type": "application/json" },
                );
                const response = await openStream(
                    request,
                    { method: "POST", body: JSON.stringify({ ...body, offset: this.offset }) },
                    transport,
                );
                this.offset = ((await response.json()) as { offset: number }).offset;
                return;
            } catch (err) {
                // An HTTP error response is the server's answer; anything else never got one.
                const answered = err instanceof HarnessStreamError;
                if (answered || attempt >= retries) throw toHarnessError(err);
                await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
            }
        }
    }
}

function startBody(command: Command, options: SpawnOptions) {
    return {
        argv: argvOf(command),
        workdir: options.cwd,
        timeout_seconds: timeoutSecondsOf(options.timeoutMs),
    };
}

async function openExecStream(
    ctx: RuntimeContext,
    sessionId: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<AsyncGenerator<SseFrame>> {
    const transport = { ...ctx.transport, signal };
    try {
        const request = await prepareRequest(
            HttpMethod.POST,
            ExecRequestBuilderUriTemplate,
            { session_id: sessionId },
            {},
            transport,
            { Accept: "text/event-stream", "Content-Type": "application/json" },
        );
        const response = await openStream(request, { method: "POST", body: JSON.stringify(body) }, transport);
        return readSseFrames(response.body as ReadableStream<Uint8Array>, signal);
    } catch (err) {
        throw toHarnessError(err);
    }
}

/**
 * Collects output until `exit`. The stream has no event ids and closing it
 * cancels the command, so a stream that ends early is not resumed: the
 * command's outcome is unknown, and this says so instead of guessing.
 */
async function readOutput(
    frames: AsyncGenerator<SseFrame>,
    options: SpawnOptions,
    signal?: AbortSignal,
): Promise<ExecResult> {
    // One decoder per stream, so a character split across two chunks is not garbled.
    const out = { stdout: new TextDecoder(), stderr: new TextDecoder() };
    const text = { stdout: "", stderr: "" };
    const emit = (name: "stdout" | "stderr", piece: string) => {
        if (!piece) return;
        text[name] += piece;
        (name === "stdout" ? options.onStdout : options.onStderr)?.(piece);
    };

    try {
        for await (const frame of frames) {
            const data = frame.data ? (JSON.parse(frame.data) as Record<string, unknown>) : {};
            if (frame.event === "stdout" || frame.event === "stderr") {
                emit(frame.event, out[frame.event].decode(fromBase64(String(data.data ?? "")), { stream: true }));
            } else if (frame.event === "exit") {
                emit("stdout", out.stdout.decode());
                emit("stderr", out.stderr.decode());
                return {
                    exitCode: Number(data.exit_code ?? 0),
                    stdout: text.stdout,
                    stderr: text.stderr,
                    truncated: false,
                    durationMs: typeof data.duration_ms === "number" ? data.duration_ms : undefined,
                };
            } else if (frame.event === "error") {
                throw new HarnessRuntimeError(String(data.message ?? "the command failed"), 0);
            }
        }
    } catch (err) {
        if (signal?.aborted) throw new HarnessRuntimeError("the command was cancelled", 0);
        throw toHarnessError(err);
    }
    if (signal?.aborted) throw new HarnessRuntimeError("the command was cancelled", 0);
    throw new HarnessRuntimeError("the exec stream ended before the command exited; its outcome is unknown", 0);
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let at = 0; at < bytes.length; at += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    }
    return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
