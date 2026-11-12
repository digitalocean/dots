/**
 * Incremental sandbox exec.
 *
 * Use the generated `sandbox.exec.post()` for the buffered mode: it already
 * returns stdout, stderr, and the exit code as JSON once the command finishes,
 * and that is the right call for anything short.
 *
 * This helper is for the streaming mode, where output has to arrive while the
 * command is still running. The endpoint serves it when the request asks for
 * `text/event-stream`.
 */

import {
    HttpMethod,
    openStream,
    prepareRequest,
    type HarnessStreamOptions,
} from "./harnessStream.js";
import { readSseFrames } from "./sseFrames.js";
import { ExecRequestBuilderUriTemplate } from "../v2/agents/sessions/item/sandbox/exec/index.js";

/** A chunk of output, or the command's outcome. */
export type SandboxExecEvent =
    | { type: "stdout" | "stderr"; text: string; bytes: Uint8Array }
    | { type: "exit"; exitCode: number; durationMs?: number }
    | { type: "error"; message: string };

/** The command to run. Mirrors the `exec_in_sandbox_request` body. */
export interface SandboxExecRequest {
    /** Program and arguments. Run directly, with no shell interpretation. */
    argv: string[];
    /** Working directory. Empty uses the sandbox default. */
    workdir?: string;
    /** Base64 stdin, delivered in full and then closed so the process sees EOF. */
    stdin?: string;
    /** Clamped server-side regardless of what is sent here. */
    timeoutSeconds?: number;
}

/** Options for {@link streamSandboxExec}. */
export interface SandboxExecStreamOptions extends HarnessStreamOptions {
    /** The session whose sandbox runs the command. */
    sessionId: string;
    /** The command to run. */
    request: SandboxExecRequest;
}

/**
 * Runs a command and yields its output as it is produced.
 *
 * The iteration ends after the `exit` event. A non-zero exit code arrives as a
 * normal `exit` event rather than a thrown error, matching the buffered mode
 * where a failed command is still a 200. A failure of the exec itself — the
 * sandbox going away mid-command, say — arrives as an `error` event, because by
 * then the response status has already been sent.
 */
export async function* streamSandboxExec(
    options: SandboxExecStreamOptions,
): AsyncGenerator<SandboxExecEvent> {
    const body: Record<string, unknown> = { argv: options.request.argv };
    if (options.request.workdir !== undefined) body.workdir = options.request.workdir;
    if (options.request.stdin !== undefined) body.stdin = options.request.stdin;
    if (options.request.timeoutSeconds !== undefined) {
        body.timeout_seconds = options.request.timeoutSeconds;
    }

    const prepared = await prepareRequest(
        HttpMethod.POST,
        ExecRequestBuilderUriTemplate,
        { session_id: options.sessionId },
        {},
        options,
        { Accept: "text/event-stream", "Content-Type": "application/json" },
    );

    const response = await openStream(
        prepared,
        { method: "POST", body: JSON.stringify(body) },
        options,
    );

    for await (const frame of readSseFrames(response.body!, options.signal)) {
        switch (frame.event) {
            case "stdout":
            case "stderr": {
                // Output is base64 so a frame can carry bytes that are not valid
                // UTF-8 and would otherwise break the line-oriented SSE framing.
                const bytes = decodeBase64(frame.data);
                yield { type: frame.event, bytes, text: new TextDecoder().decode(bytes) };
                break;
            }
            case "exit": {
                const payload = parseJsonObject(frame.data);
                yield {
                    type: "exit",
                    exitCode: typeof payload.exit_code === "number" ? payload.exit_code : -1,
                    durationMs:
                        typeof payload.duration_ms === "number" ? payload.duration_ms : undefined,
                };
                return;
            }
            case "error": {
                const payload = parseJsonObject(frame.data);
                yield {
                    type: "error",
                    message:
                        typeof payload.message === "string" ? payload.message : frame.data,
                };
                return;
            }
            default:
                // An event kind added later is ignored rather than mistaken for
                // output.
                break;
        }
    }
}

/** Decodes base64 on both Node and the browser. */
function decodeBase64(value: string): Uint8Array {
    if (value === "") return new Uint8Array(0);

    const globalAtob = (globalThis as { atob?: (data: string) => string }).atob;
    if (globalAtob) {
        const binary = globalAtob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    const nodeBuffer = (globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } })
        .Buffer;
    if (nodeBuffer) return new Uint8Array(nodeBuffer.from(value, "base64"));

    throw new Error("no base64 decoder available: expected atob or Buffer");
}

function parseJsonObject(raw: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}
