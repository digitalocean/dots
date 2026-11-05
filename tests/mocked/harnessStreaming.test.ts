import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { parseSseFrames, readSseFrames } from "../../src/dots/streaming/sseFrames.js";
import {
    collectSessionEvents,
    streamSessionEvents,
} from "../../src/dots/streaming/sessionEvents.js";
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

describe("readSseFrames", () => {
    const encode = (text: string) => new TextEncoder().encode(text);

    /** A body that serves `chunks`, then stays open, and records a cancel. */
    function openBody(chunks: string[]) {
        const state = { cancelled: false };
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(encode(chunk));
            },
            cancel() {
                state.cancelled = true;
            },
        });
        return { body, state };
    }

    it("reassembles a frame split across chunks", async () => {
        const { body } = openBody(["event: a\nda", "ta: 1\n", "\n"]);
        const frames = [];
        for await (const frame of readSseFrames(body)) {
            frames.push(frame);
            break;
        }
        expect(frames).toEqual([{ event: "a", data: "1", id: undefined, retry: undefined }]);
    });

    it("cancels the body when the caller breaks out", async () => {
        const { body, state } = openBody(["data: 1\n\n", "data: 2\n\n"]);
        for await (const _frame of readSseFrames(body)) break;
        expect(state.cancelled).toBe(true);
    });

    it("ends without an error when aborted during a read", async () => {
        const { body, state } = openBody([]);
        const controller = new AbortController();
        const frames = readSseFrames(body, controller.signal);
        const next = frames.next();
        controller.abort();
        await expect(next).resolves.toEqual({ done: true, value: undefined });
        expect(state.cancelled).toBe(true);
    });

    it("drops a frame the stream ended in the middle of", async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encode("id: 1\ndata: whole\n\nid: 2\ndata: cut"));
                controller.close();
            },
        });
        const frames = [];
        for await (const frame of readSseFrames(body)) frames.push(frame);
        expect(frames.map((f) => f.id)).toEqual(["1"]);
    });

    it("reports keepalive comments as activity", async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encode(": keepalive\n\n"));
                controller.enqueue(encode(": keepalive\n\n"));
                controller.close();
            },
        });
        let activity = 0;
        for await (const _frame of readSseFrames(body, undefined, () => activity++)) {
            // keepalives yield no frame
        }
        expect(activity).toBe(2);
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

        // The replay lane ignores `cursor`, so the resume point travels as replay_from.
        expect(seenUrl).toBe(
            "https://api.digitalocean.com/v2/agents/sessions/abc/events?replay_from=01J&replay_only=true",
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
            reconnect: false,
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

describe("streamSessionEvents resume rules", () => {
    /** One server envelope as the stream carries it. */
    const frame = (id: string, type: string, data: unknown = {}, runId = "run-1") =>
        `event: ${type}\nid: ${id}\ndata: ${JSON.stringify({ event_id: id, run_id: runId, type, data })}\n\n`;

    /** Serves one scripted response per connection and records each URL. */
    function scripted(responses: Array<() => Response>) {
        const urls: string[] = [];
        const fetchImpl = (async (url: string) => {
            urls.push(url);
            const next = responses.shift();
            if (!next) throw new Error("no more scripted responses");
            return next();
        }) as unknown as typeof fetch;
        return { urls, fetchImpl };
    }

    const fast = { authProvider, sessionId: "abc", retryBaseDelayMs: 1 };

    it("reconnects after a drop and resumes after the last handled event", async () => {
        const { urls, fetchImpl } = scripted([
            () => sseResponse([frame("01A", "run.started"), frame("01B", "run.token_delta", { text: "hi" })]),
            // The server redelivers 01B, which must not reach the caller twice.
            () => sseResponse([frame("01B", "run.token_delta"), frame("01C", "run.completed")]),
        ]);

        const ids = [];
        for await (const event of streamSessionEvents({ ...fast, fetchImpl })) {
            ids.push(event.eventId);
            if (event.type === "run.completed") break;
        }

        expect(ids).toEqual(["01A", "01B", "01C"]);
        expect(urls[0]).not.toContain("cursor=");
        expect(urls[1]).toContain("cursor=01B");
    });

    it("exposes the envelope's run id and payload", async () => {
        const { fetchImpl } = scripted([() => sseResponse([frame("01A", "run.token_delta", { text: "yo" }, "run-9")])]);
        const [event] = await take(streamSessionEvents({ ...fast, fetchImpl, reconnect: false }), 1);
        expect(event).toEqual(
            expect.objectContaining({ type: "run.token_delta", eventId: "01A", runId: "run-9", payload: { text: "yo" } }),
        );
    });

    it("stops without reconnecting when another attach supersedes it", async () => {
        const { urls, fetchImpl } = scripted([
            () => sseResponse([frame("01A", "stream.state", { state: "superseded" })]),
        ]);
        const events = await take(streamSessionEvents({ ...fast, fetchImpl }), 10);
        expect(events.map((e) => e.type)).toEqual(["stream.state"]);
        expect(urls).toHaveLength(1);
    });

    it("drops the resume point and reattaches from the head after a rollback", async () => {
        const { urls, fetchImpl } = scripted([
            () => sseResponse([frame("01A", "run.started"), frame("01B", "stream.state", { state: "rolled_back" })]),
            () => sseResponse([frame("01A", "run.started")]),
        ]);
        const events = await take(streamSessionEvents({ ...fast, fetchImpl }), 3);
        expect(events.map((e) => e.eventId)).toEqual(["01A", "01B", "01A"]);
        expect(urls[1]).not.toContain("cursor=");
    });

    it("raises a client error at once but retries a server error", async () => {
        const notFound = scripted([
            () => new Response(JSON.stringify({ message: "session not found" }), { status: 404 }),
        ]);
        await expect(take(streamSessionEvents({ ...fast, fetchImpl: notFound.fetchImpl }), 1)).rejects.toThrow(
            "session not found",
        );
        expect(notFound.urls).toHaveLength(1);

        const flaky = scripted([
            () => new Response("{}", { status: 503 }),
            () => sseResponse([frame("01A", "run.started")]),
        ]);
        const events = await take(streamSessionEvents({ ...fast, fetchImpl: flaky.fetchImpl }), 1);
        expect(events.map((e) => e.eventId)).toEqual(["01A"]);
        expect(flaky.urls).toHaveLength(2);
    });

    it("treats a silent connection as lost and reconnects", async () => {
        const silent = () => new Response(new ReadableStream<Uint8Array>(), { status: 200 });
        const { urls, fetchImpl } = scripted([silent, () => sseResponse([frame("01A", "run.started")])]);
        const events = await take(streamSessionEvents({ ...fast, fetchImpl, idleTimeoutMs: 30 }), 1);
        expect(events.map((e) => e.eventId)).toEqual(["01A"]);
        expect(urls).toHaveLength(2);
    });

    it("gives up after maxReconnects failures in a row", async () => {
        const { fetchImpl } = scripted([
            () => new Response("{}", { status: 502 }),
            () => new Response("{}", { status: 502 }),
            () => new Response("{}", { status: 502 }),
        ]);
        await expect(take(streamSessionEvents({ ...fast, fetchImpl, maxReconnects: 2 }), 1)).rejects.toThrow(
            "reconnect attempts",
        );
    });

    it("collects a replay and reports truncation", async () => {
        const { urls, fetchImpl } = scripted([
            () =>
                sseResponse([
                    frame("01A", "stream.state", { state: "catching_up", truncated: true }),
                    frame("01B", "run.started"),
                    frame("01C", "run.completed"),
                ]),
        ]);
        const replay = await collectSessionEvents({ ...fast, fetchImpl, cursor: "019" });
        expect(replay.truncated).toBe(true);
        expect(replay.events.map((e) => e.eventId)).toEqual(["01B", "01C"]);
        expect(urls[0]).toContain("replay_from=019");
        expect(urls[0]).toContain("replay_only=true");
    });
});

/** Takes up to `n` items, then leaves the loop (which closes the stream). */
async function take<T>(source: AsyncIterable<T>, n: number): Promise<T[]> {
    const items: T[] = [];
    for await (const item of source) {
        items.push(item);
        if (items.length >= n) break;
    }
    return items;
}

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
