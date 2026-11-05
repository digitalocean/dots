/**
 * Port forwarding over a WebSocket.
 *
 * The generated request builder issues a plain GET, which cannot carry a
 * protocol upgrade, so this endpoint is unreachable through it. This helper
 * performs the upgrade and hands back a byte-oriented tunnel.
 */

import {
    HttpMethod,
    prepareRequest,
    type HarnessStreamOptions,
} from "./harnessStream.js";
import { WithPortItemRequestBuilderUriTemplate } from "../v2/agents/sessions/item/portForward/item/index.js";

/** Why the tunnel ended. */
export interface PortForwardClose {
    /** WebSocket close code. 1000 is a clean shutdown. */
    code: number;
    /** Close reason, when the server sent one. */
    reason: string;
}

/** An open tunnel to a port inside the sandbox. */
export interface PortForwardTunnel {
    /** Writes bytes to the forwarded port. */
    send(bytes: Uint8Array): void;
    /** Closes the tunnel. */
    close(code?: number, reason?: string): void;
    /** Resolves once the tunnel has closed, however it closed. */
    readonly closed: Promise<PortForwardClose>;
}

/** The subset of the WebSocket API this helper drives. */
export interface PortForwardSocket {
    binaryType: string;
    send(data: Uint8Array): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: string, listener: (event: never) => void): void;
}

/**
 * Builds the socket.
 *
 * `headers` carries the Authorization the API requires. The platform WebSocket
 * cannot set request headers, so a factory that ignores them will be rejected
 * with 401 — see {@link openPortForward}.
 */
export type WebSocketFactory = (
    url: string,
    headers: Record<string, string>,
) => PortForwardSocket;

/** Options for {@link openPortForward}. */
export interface OpenPortForwardOptions extends HarnessStreamOptions {
    /** The session whose sandbox holds the port. */
    sessionId: string;
    /** The port inside the sandbox to forward. */
    port: number;
    /** Receives every byte the forwarded port writes back. */
    onData: (bytes: Uint8Array) => void;
    /**
     * Builds the socket. Required under Node, where the platform WebSocket
     * cannot send the Authorization header.
     */
    webSocketFactory?: WebSocketFactory;
}

/**
 * Opens a tunnel to `port` inside the session's sandbox.
 *
 * Resolves once the server has accepted the upgrade, and rejects if it refused
 * it. Because an upgrade is refused before any WebSocket close frame, a refusal
 * surfaces as a rejection here rather than through `closed`.
 *
 * Authenticating this needs a request header, which the WebSocket API has no
 * way to set. Under Node, pass a `webSocketFactory` over a library that does —
 * with `ws` that is:
 *
 * ```ts
 * import WebSocket from "ws";
 * const tunnel = await openPortForward({
 *   authProvider, sessionId, port: 8080, onData: (b) => process.stdout.write(b),
 *   webSocketFactory: (url, headers) => new WebSocket(url, { headers }),
 * });
 * ```
 */
export async function openPortForward(
    options: OpenPortForwardOptions,
): Promise<PortForwardTunnel> {
    const prepared = await prepareRequest(
        HttpMethod.GET,
        WithPortItemRequestBuilderUriTemplate,
        { session_id: options.sessionId, port: options.port },
        {},
        options,
    );

    const socket = (options.webSocketFactory ?? defaultWebSocketFactory)(
        toWebSocketUrl(prepared.url),
        prepared.headers,
    );
    // Without this the browser delivers text frames as strings.
    socket.binaryType = "arraybuffer";

    let settleClosed: (close: PortForwardClose) => void = () => undefined;
    const closed = new Promise<PortForwardClose>((resolve) => {
        settleClosed = resolve;
    });

    return new Promise<PortForwardTunnel>((resolve, reject) => {
        let opened = false;

        socket.addEventListener("open", (() => {
            opened = true;
            resolve({
                send: (bytes) => socket.send(bytes),
                close: (code, reason) => socket.close(code, reason),
                closed,
            });
        }) as (event: never) => void);

        socket.addEventListener("message", ((event: { data: unknown }) => {
            options.onData(toBytes(event.data));
        }) as unknown as (event: never) => void);

        socket.addEventListener("close", ((event: { code?: number; reason?: string }) => {
            const close: PortForwardClose = {
                code: event.code ?? 1006,
                reason: event.reason ?? "",
            };
            settleClosed(close);
            if (!opened) {
                reject(
                    new Error(
                        `port-forward upgrade refused (close ${close.code}${close.reason ? `: ${close.reason}` : ""})`,
                    ),
                );
            }
        }) as unknown as (event: never) => void);

        socket.addEventListener("error", ((event: { message?: string }) => {
            if (!opened) reject(new Error(event.message ?? "port-forward connection failed"));
        }) as unknown as (event: never) => void);

        options.signal?.addEventListener("abort", () => socket.close(1000, "aborted"));
    });
}

/** Rewrites the https URL the template produced to its WebSocket scheme. */
function toWebSocketUrl(url: string): string {
    return url.replace(/^http/, "ws");
}

function defaultWebSocketFactory(url: string): PortForwardSocket {
    const Impl = (globalThis as { WebSocket?: new (url: string) => PortForwardSocket }).WebSocket;
    if (!Impl) {
        throw new Error(
            "no WebSocket implementation available: pass webSocketFactory, for example " +
                "(url, headers) => new WebSocket(url, { headers }) using the `ws` package",
        );
    }
    return new Impl(url);
}

/** Normalizes what the message event carries into bytes. */
function toBytes(data: unknown): Uint8Array {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (typeof data === "string") return new TextEncoder().encode(data);
    throw new Error("unexpected port-forward frame payload");
}
