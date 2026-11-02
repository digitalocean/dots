import http from "node:http";
import type { AddressInfo } from "node:net";

import {
    openPortForward,
    streamSandboxExec,
    streamSessionEvents,
    type AgentStreamEvent,
} from "../../src/dots/streaming/agents.js";

const TOKEN = "test-token";

/**
 * A local server standing in for the Harness Runtime API. Each test installs
 * its own handler, so assertions can look at the request the helper actually
 * sent rather than at a mocked fetch.
 */
function startServer(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void>; server: http.Server }> {
    const server = http.createServer(handler);
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                baseUrl: `http://127.0.0.1:${port}`,
                server,
                close: () =>
                    new Promise<void>((done) => {
                        server.closeAllConnections();
                        server.close(() => done());
                    }),
            });
        });
    });
}

function writeSSE(res: http.ServerResponse, frames: string[]): void {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const frame of frames) res.write(`${frame}\n\n`);
}

describe("streamSessionEvents", () => {
    it("yields each frame with its event type and parsed data", async () => {
        const { baseUrl, close } = await startServer((_req, res) => {
            writeSSE(res, [
                ": keepalive",
                'event: stream.state\ndata: {"state":"replaying"}',
                'event: run.started\nid: evt-1\ndata: {"run_id":"run-9"}',
            ]);
            res.end();
        });

        const seen: AgentStreamEvent[] = [];
        for await (const event of streamSessionEvents({
            token: TOKEN,
            sessionId: "sess-1",
            baseUrl,
        })) {
            seen.push(event);
        }
        await close();

        expect(seen.map((e) => e.type)).toEqual(["stream.state", "run.started"]);
        expect(seen[0].data).toEqual({ state: "replaying" });
        expect(seen[1].id).toBe("evt-1");
        expect(seen[1].data).toEqual({ run_id: "run-9" });
    });

    it("sends the bearer token and the replay parameters", async () => {
        let seenUrl = "";
        let seenAuth: string | undefined;
        let seenAccept: string | undefined;
        let seenLastEventId: string | undefined;

        const { baseUrl, close } = await startServer((req, res) => {
            seenUrl = req.url ?? "";
            seenAuth = req.headers.authorization;
            seenAccept = req.headers.accept;
            seenLastEventId = req.headers["last-event-id"] as string | undefined;
            writeSSE(res, ['event: stream.state\ndata: {"state":"done"}']);
            res.end();
        });

        for await (const _event of streamSessionEvents({
            token: TOKEN,
            sessionId: "sess-1",
            baseUrl,
            replayOnly: true,
            replayFrom: "evt-4",
            deviceId: "device-7",
            lastEventId: "evt-3",
        })) {
            // drain
        }
        await close();

        expect(seenUrl).toContain("/v2/agents/sessions/sess-1/events");
        expect(seenUrl).toContain("replay_only=true");
        expect(seenUrl).toContain("replay_from=evt-4");
        expect(seenUrl).toContain("device_id=device-7");
        expect(seenAuth).toBe(`Bearer ${TOKEN}`);
        expect(seenAccept).toBe("text/event-stream");
        expect(seenLastEventId).toBe("evt-3");
    });

    it("leaving the loop aborts a live stream that never closes", async () => {
        let aborted = false;
        const { baseUrl, close } = await startServer((req, res) => {
            req.on("close", () => {
                aborted = true;
            });
            writeSSE(res, ['event: run.started\ndata: {"run_id":"run-9"}']);
            // Never ends: this is the live-attach case the generated client
            // cannot handle.
        });

        const types: string[] = [];
        for await (const event of streamSessionEvents({
            token: TOKEN,
            sessionId: "sess-1",
            baseUrl,
        })) {
            types.push(event.type);
            break;
        }

        expect(types).toEqual(["run.started"]);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(aborted).toBe(true);
        await close();
    });

    it("an external signal ends the stream", async () => {
        const { baseUrl, close } = await startServer((_req, res) => {
            writeSSE(res, ['event: run.log\ndata: {"line":"one"}']);
        });

        const controller = new AbortController();
        const stream = streamSessionEvents({
            token: TOKEN,
            sessionId: "sess-1",
            baseUrl,
            signal: controller.signal,
        });

        const types: string[] = [];
        setTimeout(() => controller.abort(), 60);
        for await (const event of stream) types.push(event.type);
        await close();

        expect(types).toEqual(["run.log"]);
    });

    it("raises the API's message and request id", async () => {
        const { baseUrl, close } = await startServer((_req, res) => {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "forbidden", message: "not your session", request_id: "req-5" }));
        });

        const stream = streamSessionEvents({ token: TOKEN, sessionId: "sess-1", baseUrl });
        await expect(
            (async () => {
                for await (const _event of stream) {
                    // the first read rejects
                }
            })(),
        ).rejects.toThrow(/403.*not your session.*req-5/);
        await close();
    });
});

describe("streamSandboxExec", () => {
    it("asks for the streaming mode and posts the command", async () => {
        let seenUrl = "";
        let seenAccept: string | undefined;
        let body = "";

        const { baseUrl, close } = await startServer((req, res) => {
            seenUrl = req.url ?? "";
            seenAccept = req.headers.accept;
            req.on("data", (chunk) => {
                body += String(chunk);
            });
            req.on("end", () => {
                writeSSE(res, ['event: exec.stdout\ndata: {"text":"hello\\n"}', 'event: exec.exit\ndata: {"exit_code":0}']);
                res.end();
            });
        });

        const seen: AgentStreamEvent[] = [];
        for await (const event of streamSandboxExec({
            token: TOKEN,
            sessionId: "sess-1",
            baseUrl,
            argv: ["echo", "hello"],
            workdir: "/workspace",
            timeoutSeconds: 30,
            stdin: new TextEncoder().encode("hi"),
        })) {
            seen.push(event);
        }
        await close();

        expect(seenUrl).toContain("/v2/agents/sessions/sess-1/sandbox/exec");
        expect(seenUrl).toContain("stream=1");
        expect(seenAccept).toBe("text/event-stream");
        expect(JSON.parse(body)).toEqual({
            argv: ["echo", "hello"],
            workdir: "/workspace",
            timeout_seconds: 30,
            stdin: "aGk=",
        });
        expect(seen.map((e) => e.type)).toEqual(["exec.stdout", "exec.exit"]);
        expect(seen[1].data).toEqual({ exit_code: 0 });
    });
});

/**
 * A stand-in for the global WebSocket. Node's own implementation does deliver
 * the Authorization header (that is what makes port-forward work outside a
 * browser), but it does not drive its events inside Jest's VM context, so the
 * handshake is stubbed and the helper's own behaviour is what gets asserted.
 */
class FakeWebSocket {
    static last: FakeWebSocket | undefined;

    binaryType = "";
    sent: Uint8Array[] = [];
    closedWith: { code?: number; reason?: string } | undefined;
    onopen: (() => void) | undefined;
    onerror: (() => void) | undefined;
    onclose: ((event: { code: number; reason: string }) => void) | undefined;
    onmessage: ((event: { data: unknown }) => void) | undefined;

    constructor(
        readonly url: string,
        readonly options?: { headers?: Record<string, string> },
    ) {
        FakeWebSocket.last = this;
    }

    send(data: Uint8Array): void {
        this.sent.push(data);
    }

    close(code?: number, reason?: string): void {
        this.closedWith = { code, reason };
        this.onclose?.({ code: code ?? 1000, reason: reason ?? "" });
    }
}

describe("openPortForward", () => {
    const realWebSocket = (globalThis as Record<string, unknown>).WebSocket;

    beforeEach(() => {
        FakeWebSocket.last = undefined;
        (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    });

    afterEach(() => {
        (globalThis as Record<string, unknown>).WebSocket = realWebSocket;
    });

    it("rejects a port outside the allowed range", async () => {
        await expect(
            openPortForward({ token: TOKEN, sessionId: "sess-1", port: 80 }),
        ).rejects.toThrow(/between 1024 and 65535/);
    });

    it("opens a ws:// URL carrying the bearer token", async () => {
        const opening = openPortForward({
            token: TOKEN,
            sessionId: "sess-1",
            port: 8080,
            baseUrl: "http://127.0.0.1:9999",
        });
        FakeWebSocket.last!.onopen!();
        await opening;

        const socket = FakeWebSocket.last!;
        expect(socket.url).toBe("ws://127.0.0.1:9999/v2/agents/sessions/sess-1/port-forward/8080");
        expect(socket.options?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(socket.binaryType).toBe("arraybuffer");
    });

    it("carries bytes both ways and resolves closed", async () => {
        const received: Uint8Array[] = [];
        const opening = openPortForward({
            token: TOKEN,
            sessionId: "sess-1",
            port: 8080,
            onData: (chunk) => received.push(chunk),
        });
        const socket = FakeWebSocket.last!;
        socket.onopen!();
        const tunnel = await opening;

        tunnel.send(new TextEncoder().encode("ping"));
        socket.onmessage!({ data: new TextEncoder().encode("ok").buffer });

        tunnel.close(1000, "done");
        await expect(tunnel.closed).resolves.toEqual({ code: 1000, reason: "done" });

        expect(new TextDecoder().decode(socket.sent[0])).toBe("ping");
        expect(new TextDecoder().decode(received[0])).toBe("ok");
    });

    it("a close before open rejects rather than hanging", async () => {
        const opening = openPortForward({ token: TOKEN, sessionId: "sess-1", port: 8080 });
        FakeWebSocket.last!.onclose!({ code: 4403, reason: "forbidden" });
        await expect(opening).rejects.toThrow(/closed before opening \(code 4403: forbidden\)/);
    });

    it("explains the failure when no WebSocket is available", async () => {
        delete (globalThis as Record<string, unknown>).WebSocket;
        await expect(
            openPortForward({ token: TOKEN, sessionId: "sess-1", port: 8080 }),
        ).rejects.toThrow(/no global WebSocket/);
    });
});
