/**
 * Port forwarding over a WebSocket.
 *
 * The generated request builder issues a plain GET, which cannot carry a
 * protocol upgrade, so this endpoint is unreachable through it. This helper
 * performs the upgrade and hands back a byte-oriented tunnel.
 */
import { HttpMethod, prepareRequest, } from "./harnessStream.js";
import { WithPortItemRequestBuilderUriTemplate } from "../v2/agents/sessions/item/portForward/item/index.js";
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
export async function openPortForward(options) {
    const prepared = await prepareRequest(HttpMethod.GET, WithPortItemRequestBuilderUriTemplate, { session_id: options.sessionId, port: options.port }, {}, options);
    const socket = (options.webSocketFactory ?? defaultWebSocketFactory)(toWebSocketUrl(prepared.url), prepared.headers);
    // Without this the browser delivers text frames as strings.
    socket.binaryType = "arraybuffer";
    let settleClosed = () => undefined;
    const closed = new Promise((resolve) => {
        settleClosed = resolve;
    });
    return new Promise((resolve, reject) => {
        let opened = false;
        socket.addEventListener("open", (() => {
            opened = true;
            resolve({
                send: (bytes) => socket.send(bytes),
                close: (code, reason) => socket.close(code, reason),
                closed,
            });
        }));
        socket.addEventListener("message", ((event) => {
            options.onData(toBytes(event.data));
        }));
        socket.addEventListener("close", ((event) => {
            const close = {
                code: event.code ?? 1006,
                reason: event.reason ?? "",
            };
            settleClosed(close);
            if (!opened) {
                reject(new Error(`port-forward upgrade refused (close ${close.code}${close.reason ? `: ${close.reason}` : ""})`));
            }
        }));
        socket.addEventListener("error", ((event) => {
            if (!opened)
                reject(new Error(event.message ?? "port-forward connection failed"));
        }));
        options.signal?.addEventListener("abort", () => socket.close(1000, "aborted"));
    });
}
/** Rewrites the https URL the template produced to its WebSocket scheme. */
function toWebSocketUrl(url) {
    return url.replace(/^http/, "ws");
}
function defaultWebSocketFactory(url) {
    const Impl = globalThis.WebSocket;
    if (!Impl) {
        throw new Error("no WebSocket implementation available: pass webSocketFactory, for example " +
            "(url, headers) => new WebSocket(url, { headers }) using the `ws` package");
    }
    return new Impl(url);
}
/** Normalizes what the message event carries into bytes. */
function toBytes(data) {
    if (data instanceof Uint8Array)
        return data;
    if (data instanceof ArrayBuffer)
        return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (typeof data === "string")
        return new TextEncoder().encode(data);
    throw new Error("unexpected port-forward frame payload");
}
