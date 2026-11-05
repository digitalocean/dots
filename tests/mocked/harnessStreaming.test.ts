import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { parseSseFrames } from "../../src/dots/streaming/sseFrames.js";
import { streamSessionEvents } from "../../src/dots/streaming/sessionEvents.js";
import {
    openPortForward,
    type PortForwardSocket,
} from "../../src/dots/streaming/portForward.js";

const authProvider = new DigitalOceanApiKeyAuthenticationProvider("test-token");

/** Serves `chunks` as a streaming response, one enqueue per chunk. */
function sseResponse(chunks: string[], init: ResponseInit = {}): Response {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
            controller.close();
        },
    });
    return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        ...init,
    });
}

describe("parseSseFrames", () => {
    it("keeps the event and id fields, not just data", () => {
        const { frames } = parseSseFrames("event: stdout\nid: 01J\ndata: hello\n\n");
        expect(frames).toEqual([{ event: "stdout", id: "01J", data: "hello", retry: undefined }]);
    });

    it("joins multiple data lines with newlines", () => {
        const { frames } = parseSseFrames("data: one\ndata: two\n\n");
        expect(frames[0].data).toBe("one\ntwo");
    });

    it("yields no frame for a keepalive comment", () => {
        const { frames } = parseSseFrames(": keepalive\n\n");
        expect(frames).toHaveLength(0);
    });

    it("returns an incomplete frame as the remainder", () => {
        const { frames, rest } = parseSseFrames("data: done\n\ndata: partia");
        expect(frames).toHaveLength(1);
        expect(rest).toBe("data: partia");
    });
});

describe("streamSessionEvents", () => {
    it("builds the URL from the generated template and authenticates", async () => {
        let seenUrl = "";
        let seenAuth: string | null = null;
        const fetchImpl = (async (url: string, init: RequestInit) => {
            seenUrl = url;
            seenAuth = new Headers(init.headers).get("Authorization");
            return sseResponse([]);
        }) as unknown as typeof fetch;

        for await (const _ of streamSessionEvents({
            authProvider,
            fetchImpl,
            sessionId: "abc",
            replayOnly: true,
            cursor: "01J",
        })) {
            // drain
        }

        expect(seenUrl).toBe(
            "https://api.digitalocean.com/v2/agents/sessions/abc/events?cursor=01J&replay_only=true",
        );
        expect(seenAuth).toBe("Bearer test-token");
    });

    it("parses events and drops a redelivered id", async () => {
        const fetchImpl = (async () =>
            sseResponse([
                'event: stream.state\nid: 01A\ndata: {"state":"attached"}\n\n',
                ": keepalive\n\n",
                'event: message\nid: 01B\ndata: {"text":"hi"}\n\n',
                'event: message\nid: 01B\ndata: {"text":"hi"}\n\n',
            ])) as unknown as typeof fetch;

        const events = [];
        for await (const event of streamSessionEvents({
            authProvider,
            fetchImpl,
            sessionId: "abc",
        })) {
            events.push(event);
        }

        expect(events.map((e) => e.type)).toEqual(["stream.state", "message"]);
        expect(events[1].data).toEqual({ text: "hi" });
        expect(events[1].eventId).toBe("01B");
    });

    it("reports the error envelope rather than an empty stream", async () => {
        const fetchImpl = (async () =>
            new Response(JSON.stringify({ message: "session not found", request_id: "req-1" }), {
                status: 404,
            })) as unknown as typeof fetch;

        const iterator = streamSessionEvents({ authProvider, fetchImpl, sessionId: "abc" });
        await expect(iterator.next()).rejects.toThrow(
            expect.objectContaining({ message: "session not found", status: 404 }) as Error,
        );
    });
});

describe("openPortForward", () => {
    /** Stands in for a WebSocket, letting the test drive its events. */
    class FakeSocket implements PortForwardSocket {
        binaryType = "";
        sent: Uint8Array[] = [];
        closedWith?: { code?: number; reason?: string };
        private listeners = new Map<string, ((event: never) => void)[]>();

        send(data: Uint8Array): void {
            this.sent.push(data);
        }
        close(code?: number, reason?: string): void {
            this.closedWith = { code, reason };
            this.emit("close", { code: code ?? 1000, reason: reason ?? "" });
        }
        addEventListener(type: string, listener: (event: never) => void): void {
            const existing = this.listeners.get(type) ?? [];
            existing.push(listener);
            this.listeners.set(type, existing);
        }
        emit(type: string, event: unknown): void {
            for (const listener of this.listeners.get(type) ?? []) {
                (listener as (event: unknown) => void)(event);
            }
        }
    }

    it("upgrades to wss and forwards the Authorization header", async () => {
        let socket: FakeSocket | undefined;
        let seenUrl = "";
        let seenHeaders: Record<string, string> = {};
        const received: Uint8Array[] = [];

        const pending = openPortForward({
            authProvider,
            sessionId: "abc",
            port: 8080,
            onData: (bytes) => received.push(bytes),
            webSocketFactory: (url, headers) => {
                seenUrl = url;
                seenHeaders = headers;
                socket = new FakeSocket();
                return socket;
            },
        });

        // The factory only runs once the auth provider has resolved.
        await new Promise((resolve) => setTimeout(resolve, 0));
        socket!.emit("open", {});
        const tunnel = await pending;

        expect(seenUrl).toBe("wss://api.digitalocean.com/v2/agents/sessions/abc/port-forward/8080");
        expect(seenHeaders.Authorization).toBe("Bearer test-token");
        expect(socket!.binaryType).toBe("arraybuffer");

        socket!.emit("message", { data: new TextEncoder().encode("pong") });
        expect(new TextDecoder().decode(received[0])).toBe("pong");

        tunnel.send(new TextEncoder().encode("ping"));
        expect(new TextDecoder().decode(socket!.sent[0])).toBe("ping");

        socket!.emit("close", { code: 1000, reason: "bye" });
        await expect(tunnel.closed).resolves.toEqual({ code: 1000, reason: "bye" });
    });

    it("rejects when the server refuses the upgrade", async () => {
        let socket: FakeSocket | undefined;
        const pending = openPortForward({
            authProvider,
            sessionId: "abc",
            port: 8080,
            onData: () => undefined,
            webSocketFactory: () => {
                socket = new FakeSocket();
                return socket;
            },
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
        socket!.emit("close", { code: 1008, reason: "port not listening" });

        await expect(pending).rejects.toThrow("port not listening");
    });
});
