/**
 * Harness Runtime (`/v2/agents`) streaming helpers.
 *
 * Three Harness Runtime capabilities cannot be expressed as generated methods.
 * The session event feed and streaming exec hold a `text/event-stream` body
 * open, and the generated methods only resolve once that body closes, so a
 * live attach never yields anything. Port-forward is a WebSocket upgrade,
 * which OpenAPI cannot describe at all. These helpers cover all three.
 *
 * `openPortForward` needs a WebSocket that can send an `Authorization` header,
 * which rules out browsers. The event and exec streams run anywhere `fetch`
 * exposes a readable body.
 */

/** Default DigitalOcean API origin. */
const DEFAULT_BASE_URL = "https://api.digitalocean.com";

/**
 * One frame of a Harness Runtime event stream.
 */
export interface AgentStreamEvent {
    /** The frame's `event:` name, for example `run.started` or `stream.state`. */
    type: string;
    /** The frame's `id:`, when it carries one. Persist it only after rendering. */
    id?: string;
    /** The `data:` payload, parsed as JSON when it is JSON. */
    data: unknown;
    /** The `data:` payload exactly as it arrived. */
    raw: string;
}

/** Options common to both event streams. */
interface BaseStreamOptions {
    /** A DigitalOcean API token. */
    token: string;
    /** API origin. Defaults to `https://api.digitalocean.com`. */
    baseUrl?: string;
    /** Aborts the request and ends the stream. */
    signal?: AbortSignal;
}

/**
 * Options for {@link streamSessionEvents}.
 */
export interface SessionEventStreamOptions extends BaseStreamOptions {
    /** The session UUID. */
    sessionId: string;
    /**
     * Write the stored transcript and close, rather than going live. A replay
     * does not advance the device's delivery cursor.
     */
    replayOnly?: boolean;
    /** Replay pagination cursor. Returns events after this one. Replay lane only. */
    replayFrom?: string;
    /** Resume strictly after this event. Live attach only. Sent as `Last-Event-ID`. */
    lastEventId?: string;
    /** Stable per-install device id, so this client's cursor and live slot are its own. */
    deviceId?: string;
}

/**
 * Options for {@link streamSandboxExec}.
 */
export interface SandboxExecStreamOptions extends BaseStreamOptions {
    /** The session UUID. */
    sessionId: string;
    /** The command and its arguments. */
    argv: string[];
    /** Working directory inside the sandbox. */
    workdir?: string;
    /** Standard input for the command. */
    stdin?: Uint8Array;
    /** Per-command timeout, in seconds. */
    timeoutSeconds?: number;
}

/**
 * Options for {@link openPortForward}.
 */
export interface PortForwardOptions {
    /** A DigitalOcean API token. */
    token: string;
    /** The session UUID. */
    sessionId: string;
    /** Guest TCP port. Must be between 1024 and 65535. */
    port: number;
    /** API origin. Defaults to `https://api.digitalocean.com`. */
    baseUrl?: string;
    /** Called for each binary frame the guest sends. */
    onData?: (chunk: Uint8Array) => void;
}

/**
 * An open tunnel to a guest TCP port.
 */
export interface PortForwardTunnel {
    /** Write bytes to the guest. */
    send(data: Uint8Array): void;
    /** Close the tunnel. */
    close(code?: number, reason?: string): void;
    /** Resolves when the tunnel closes, from either end. */
    readonly closed: Promise<{ code: number; reason: string }>;
}

/**
 * Raises the API's own error message rather than the bare status line. Harness
 * Runtime returns `{id, message, request_id}`, and `request_id` is what
 * support needs to trace a failure.
 */
async function throwApiError(response: Response): Promise<never> {
    const body = await response.text().catch(() => "");
    let detail = body;
    try {
        const parsed = JSON.parse(body) as { message?: string; request_id?: string };
        if (parsed.message) {
            detail = parsed.request_id
                ? `${parsed.message} (request_id ${parsed.request_id})`
                : parsed.message;
        }
    } catch {
        // Not JSON: an edge error page, or a plain-text handshake refusal.
    }
    throw new Error(
        `HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
    );
}

/**
 * Splits one SSE frame into an event. Returns undefined for a frame that
 * carries no `data:` line, which is how keepalive comments (`: keepalive`)
 * are discarded.
 */
function parseFrame(frame: string): AgentStreamEvent | undefined {
    let type = "message";
    let id: string | undefined;
    const data: string[] = [];
    let sawData = false;

    for (const line of frame.split("\n")) {
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        // A single leading space after the colon is a delimiter, not content.
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);

        if (field === "event") type = value;
        else if (field === "id") id = value;
        else if (field === "data") {
            data.push(value);
            sawData = true;
        }
    }

    if (!sawData) return undefined;

    const raw = data.join("\n");
    let parsed: unknown = raw;
    try {
        parsed = JSON.parse(raw);
    } catch {
        // A non-JSON payload is surfaced as the string it is.
    }
    return { type, id, data: parsed, raw };
}

/**
 * An async-iterable event stream. `for await` reads frames as they arrive, and
 * leaving the loop (`break`, `return`, or a thrown error) aborts the request,
 * so a live attach does not outlive its consumer.
 */
export class AgentEventStream implements AsyncIterable<AgentStreamEvent> {
    private readonly queue: Array<{ value: AgentStreamEvent } | { error: Error }> = [];
    private readonly controller = new AbortController();
    private done = false;
    private wake: (() => void) | null = null;

    /** @internal */
    constructor(request: (signal: AbortSignal) => Promise<Response>, signal?: AbortSignal) {
        if (signal) {
            if (signal.aborted) this.controller.abort();
            else signal.addEventListener("abort", () => this.controller.abort(), { once: true });
        }
        void this.run(request);
    }

    /** Ends the stream and aborts the underlying request. */
    close(): void {
        this.controller.abort();
    }

    /** The signal this stream aborts with. Pass it to `fetch`. */
    get signal(): AbortSignal {
        return this.controller.signal;
    }

    private async run(request: (signal: AbortSignal) => Promise<Response>): Promise<void> {
        try {
            const response = await request(this.controller.signal);
            if (!response.ok) await throwApiError(response);
            if (!response.body) throw new Error("response body is null");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    // Frames are separated by a blank line. Keep the trailing
                    // partial frame for the next read.
                    const frames = buffer.split("\n\n");
                    buffer = frames.pop() ?? "";
                    for (const frame of frames) {
                        const event = parseFrame(frame);
                        if (event) this.push({ value: event });
                    }
                }
                const last = parseFrame(buffer);
                if (last) this.push({ value: last });
            } finally {
                reader.releaseLock();
            }
            this.end();
        } catch (err) {
            // An abort is how a consumer stops a live stream, not a failure.
            if (this.controller.signal.aborted) {
                this.end();
                return;
            }
            this.push({ error: err instanceof Error ? err : new Error(String(err)) });
            this.end();
        }
    }

    private push(item: { value: AgentStreamEvent } | { error: Error }): void {
        this.queue.push(item);
        this.signalWaiter();
    }

    private end(): void {
        this.done = true;
        this.signalWaiter();
    }

    private signalWaiter(): void {
        if (this.wake) {
            this.wake();
            this.wake = null;
        }
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<AgentStreamEvent> {
        const next = async (): Promise<IteratorResult<AgentStreamEvent>> => {
            while (this.queue.length === 0 && !this.done) {
                await new Promise<void>((resolve) => {
                    this.wake = resolve;
                });
            }
            const item = this.queue.shift();
            if (item) {
                if ("error" in item) throw item.error;
                return { value: item.value, done: false };
            }
            return { value: undefined, done: true };
        };
        // `return` runs when the consumer leaves the loop early, which is how
        // a live attach gets torn down.
        const stop = async (): Promise<IteratorResult<AgentStreamEvent>> => {
            this.close();
            return { value: undefined, done: true };
        };
        const iterator: AsyncIterableIterator<AgentStreamEvent> = {
            next,
            return: stop,
            [Symbol.asyncIterator]: () => iterator,
        };
        return iterator;
    }
}

function trimBaseUrl(baseUrl?: string): string {
    return (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Attaches to a session's event feed.
 *
 * Without `replayOnly` this is a live attach that stays open until the
 * consumer stops reading, the signal aborts, or the session ends. Keepalive
 * comments are dropped.
 *
 * ```ts
 * const events = streamSessionEvents({ token, sessionId });
 * for await (const event of events) {
 *     if (event.type === "run.started") break; // aborts the request
 * }
 * ```
 */
export function streamSessionEvents(options: SessionEventStreamOptions): AgentEventStream {
    const url = new URL(
        `${trimBaseUrl(options.baseUrl)}/v2/agents/sessions/${options.sessionId}/events`,
    );
    if (options.replayOnly) url.searchParams.set("replay_only", "true");
    if (options.replayFrom) url.searchParams.set("replay_from", options.replayFrom);
    if (options.deviceId) url.searchParams.set("device_id", options.deviceId);

    const headers: Record<string, string> = {
        Authorization: `Bearer ${options.token}`,
        Accept: "text/event-stream",
    };
    if (options.lastEventId) headers["Last-Event-ID"] = options.lastEventId;

    return new AgentEventStream(
        (signal) => fetch(url.toString(), { headers, signal }),
        options.signal,
    );
}

/**
 * Runs a command in the session sandbox and streams its output.
 *
 * The generated `sandbox.exec` method buffers the whole response, so output
 * only arrives once the command exits. This asks for the server's streaming
 * mode instead, and yields frames as the command writes them.
 */
export function streamSandboxExec(options: SandboxExecStreamOptions): AgentEventStream {
    const url = new URL(
        `${trimBaseUrl(options.baseUrl)}/v2/agents/sessions/${options.sessionId}/sandbox/exec`,
    );
    url.searchParams.set("stream", "1");

    // stdin is base64 in JSON, matching how the API carries arbitrary bytes.
    const body: Record<string, unknown> = { argv: options.argv };
    if (options.workdir) body.workdir = options.workdir;
    if (options.timeoutSeconds !== undefined) body.timeout_seconds = options.timeoutSeconds;
    if (options.stdin) body.stdin = base64(options.stdin);

    return new AgentEventStream(
        (signal) =>
            fetch(url.toString(), {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${options.token}`,
                    Accept: "text/event-stream",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal,
            }),
        options.signal,
    );
}

function base64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    // btoa is standard in Node 16+ and in browsers.
    return btoa(binary);
}

/**
 * Opens a raw TCP tunnel to a guest port over a WebSocket.
 *
 * Requires a WebSocket implementation that accepts request headers, because
 * the tunnel authenticates with a bearer token. Node 22's global `WebSocket`
 * does; browsers do not, and should use the session ingress URL instead.
 *
 * ```ts
 * const tunnel = await openPortForward({
 *     token, sessionId, port: 8080,
 *     onData: (chunk) => process.stdout.write(chunk),
 * });
 * tunnel.send(new TextEncoder().encode("GET / HTTP/1.0\r\n\r\n"));
 * await tunnel.closed;
 * ```
 */
export function openPortForward(options: PortForwardOptions): Promise<PortForwardTunnel> {
    if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
        return Promise.reject(new Error("port must be an integer between 1024 and 65535"));
    }
    const WebSocketImpl = (globalThis as { WebSocket?: unknown }).WebSocket as
        | (new (url: string, options?: unknown) => WebSocket)
        | undefined;
    if (!WebSocketImpl) {
        return Promise.reject(
            new Error(
                "no global WebSocket is available; port-forward needs Node 22 or later, " +
                    "or another WebSocket that can send an Authorization header",
            ),
        );
    }

    const url =
        `${trimBaseUrl(options.baseUrl)}/v2/agents/sessions/${options.sessionId}` +
        `/port-forward/${options.port}`;

    const socket = new WebSocketImpl(url.replace(/^http/, "ws"), {
        headers: { Authorization: `Bearer ${options.token}` },
    });
    socket.binaryType = "arraybuffer";

    let settleClosed: (value: { code: number; reason: string }) => void;
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        settleClosed = resolve;
    });

    return new Promise<PortForwardTunnel>((resolve, reject) => {
        // Until the socket opens, a failure is a handshake failure and belongs
        // to the caller's await. After that it belongs to `closed`.
        let open = false;

        socket.onerror = () => {
            if (!open) reject(new Error("port-forward handshake failed"));
        };
        socket.onclose = (event: { code: number; reason: string }) => {
            settleClosed({ code: event.code, reason: event.reason });
            if (!open) {
                reject(
                    new Error(
                        `port-forward closed before opening (code ${event.code}` +
                            `${event.reason ? `: ${event.reason}` : ""})`,
                    ),
                );
            }
        };
        socket.onmessage = (event: MessageEvent) => {
            if (!options.onData) return;
            const payload: unknown = event.data;
            if (payload instanceof ArrayBuffer) options.onData(new Uint8Array(payload));
            else if (typeof payload === "string") options.onData(new TextEncoder().encode(payload));
        };
        socket.onopen = () => {
            open = true;
            resolve({
                send: (data: Uint8Array) => socket.send(data),
                close: (code?: number, reason?: string) => socket.close(code, reason),
                closed,
            });
        };
    });
}
