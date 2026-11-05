/**
 * These helpers exist so that frames surface while the connection is still
 * open. A stubbed fetch cannot show that: a ReadableStream built up front and
 * then closed yields the same result whether the helper streams or buffers. So
 * this suite runs them against a real HTTP server on a loopback socket, which
 * trickles frames out over time and splits one of them across two writes.
 */

import http from "node:http";
import { AddressInfo } from "node:net";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { streamSessionEvents } from "../../src/dots/streaming/sessionEvents.js";

const authProvider = new DigitalOceanApiKeyAuthenticationProvider("test-token");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `condition` holds, so a socket teardown is not raced. */
async function eventually(condition: () => boolean, timeoutMs = 2000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (condition()) return true;
        await sleep(10);
    }
    return condition();
}

/** Gap between frames. Small enough to stay quick, wide enough to measure. */
const FRAME_GAP_MS = 80;

let server: http.Server;
let baseUrl: string;
let clientDisconnected: boolean;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        void (async () => {
            const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
            res.writeHead(200, { "Content-Type": "text/event-stream" });
            req.on("close", () => {
                clientDisconnected = true;
            });

            if (path.endsWith("/events")) {
                res.write('event: stream.state\nid: 01A\ndata: {"state":"attached"}\n\n');
                await sleep(FRAME_GAP_MS);
                res.write(": keepalive\n\n");
                await sleep(FRAME_GAP_MS);
                res.write('event: message\nid: 01B\ndata: {"text":"one"}\n\n');
                await sleep(FRAME_GAP_MS);
                res.end();
                return;
            }

            if (path.endsWith("/events-forever")) {
                let n = 0;
                const timer = setInterval(() => {
                    res.write(`event: message\nid: ${n}\ndata: {}\n\n`);
                    n++;
                }, 20);
                req.on("close", () => clearInterval(timer));
                return;
            }


            res.end();
        })();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    clientDisconnected = false;
});

describe("session events over a real socket", () => {
    it("delivers each event as it is sent rather than at close", async () => {
        const arrivals: number[] = [];
        const started = Date.now();

        for await (const event of streamSessionEvents({
            authProvider,
            baseUrl,
            sessionId: "abc",
        })) {
            void event;
            arrivals.push(Date.now() - started);
        }

        expect(arrivals).toHaveLength(2);
        // Buffering until close would land both at the same instant.
        expect(arrivals[1] - arrivals[0]).toBeGreaterThanOrEqual(FRAME_GAP_MS);
    });

    it("stops and disconnects when the signal aborts", async () => {
        const controller = new AbortController();
        let count = 0;

        for await (const event of streamSessionEvents({
            authProvider,
            baseUrl,
            sessionId: "abc",
            signal: controller.signal,
            fetchImpl: ((url: string, init: RequestInit) =>
                fetch(url.replace("/events", "/events-forever"), init)) as unknown as typeof fetch,
        })) {
            void event;
            if (++count === 3) controller.abort();
        }

        expect(count).toBe(3);
        // The abort releases the socket, which the server sees a tick later.
        await expect(eventually(() => clientDisconnected)).resolves.toBe(true);
    });
});
