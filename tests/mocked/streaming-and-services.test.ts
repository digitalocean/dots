/**
 * streaming-and-services.test.ts
 *
 * Mocked tests for the streaming adapter and multi-service client modules.
 */
import { RequestInformation, HttpMethod } from "@microsoft/kiota-abstractions";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import {
    StreamingRequestAdapter,
    StreamingResponseType,
} from "../../src/dots/streaming/index.js";
import {
    createStreamingAdapter,
    collectStream,
} from "../../src/dots/streaming/streamingUtils.js";
import {
    ServiceType,
    ServiceManager,
    createServiceManager,
    createDigitalOceanClient as createDOServiceClient,
    createServerlessInferenceClient,
    createAgentInferenceClient,
} from "../../src/dots/services/index.js";

// ─── Streaming Tests ────────────────────────────────────────────────

describe("StreamingRequestAdapter", () => {
    const token = "test-token";
    const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
    const baseAdapter = new FetchRequestAdapter(authProvider);

    it("should create a streaming adapter from a request adapter", () => {
        const streamingAdapter = new StreamingRequestAdapter(baseAdapter);
        expect(streamingAdapter).toBeInstanceOf(StreamingRequestAdapter);
    });

    it("should throw if underlying adapter is null", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => new StreamingRequestAdapter(null as any)).toThrow(
            "underlyingAdapter cannot be null"
        );
    });

    it("should create a streaming adapter via the factory function", () => {
        const streamingAdapter = createStreamingAdapter(baseAdapter);
        expect(streamingAdapter).toBeInstanceOf(StreamingRequestAdapter);
    });
});

describe("StreamingRequestAdapter - SSE parsing", () => {
    const token = "test-token";
    const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
    const baseAdapter = new FetchRequestAdapter(authProvider);

    it("should stream and parse SSE data", async () => {
        const sseBody = 'data: {"message":"hello"}\n\ndata: {"message":"world"}\n\n';
        const encoder = new TextEncoder();

        const mockStream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(sseBody));
                controller.close();
            },
        });

        const mockResponse = new Response(mockStream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn().mockResolvedValue(mockResponse);

        try {
            const adapter = new StreamingRequestAdapter(baseAdapter);
            const chunks: unknown[] = [];

            const requestInfo = new RequestInformation();
            requestInfo.URL = "https://inference.do-ai.run/v1/completions";
            requestInfo.httpMethod = HttpMethod.GET;

            await adapter.stream(
                requestInfo,
                {
                    onData: (data) => chunks.push(data),
                },
                { streamType: StreamingResponseType.TEXT_EVENT_STREAM }
            );

            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toEqual({ message: "hello" });
            expect(chunks[1]).toEqual({ message: "world" });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("should stream and parse NDJSON data", async () => {
        const ndjsonBody = '{"id":1,"token":"foo"}\n{"id":2,"token":"bar"}\n';
        const encoder = new TextEncoder();

        const mockStream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(ndjsonBody));
                controller.close();
            },
        });

        const mockResponse = new Response(mockStream, {
            status: 200,
            headers: { "Content-Type": "application/x-ndjson" },
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn().mockResolvedValue(mockResponse);

        try {
            const adapter = new StreamingRequestAdapter(baseAdapter);
            const chunks: unknown[] = [];

            const requestInfo = new RequestInformation();
            requestInfo.URL = "https://inference.do-ai.run/v1/completions";
            requestInfo.httpMethod = HttpMethod.GET;

            await adapter.stream(
                requestInfo,
                {
                    onData: (data) => chunks.push(data),
                },
                { streamType: StreamingResponseType.APPLICATION_NDJSON }
            );

            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toEqual({ id: 1, token: "foo" });
            expect(chunks[1]).toEqual({ id: 2, token: "bar" });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("should stream plain text line by line", async () => {
        const textBody = "line one\nline two\nline three\n";
        const encoder = new TextEncoder();

        const mockStream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(textBody));
                controller.close();
            },
        });

        const mockResponse = new Response(mockStream, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn().mockResolvedValue(mockResponse);

        try {
            const adapter = new StreamingRequestAdapter(baseAdapter);
            const chunks: unknown[] = [];

            const requestInfo = new RequestInformation();
            requestInfo.URL = "https://example.com/stream";
            requestInfo.httpMethod = HttpMethod.GET;

            await adapter.stream(
                requestInfo,
                {
                    onData: (data) => chunks.push(data),
                },
                {
                    streamType: StreamingResponseType.TEXT_PLAIN,
                    parseJsonLines: false,
                }
            );

            expect(chunks).toHaveLength(3);
            expect(chunks[0]).toBe("line one");
            expect(chunks[1]).toBe("line two");
            expect(chunks[2]).toBe("line three");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("should invoke onError and throw on HTTP error", async () => {
        const mockResponse = new Response("Not Found", { status: 404, statusText: "Not Found" });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn().mockResolvedValue(mockResponse);

        try {
            const adapter = new StreamingRequestAdapter(baseAdapter);
            const errors: Error[] = [];

            const requestInfo = new RequestInformation();
            requestInfo.URL = "https://example.com/missing";
            requestInfo.httpMethod = HttpMethod.GET;

            await expect(
                adapter.stream(
                    requestInfo,
                    {
                        onError: (err) => errors.push(err),
                    },
                    { streamType: StreamingResponseType.TEXT_EVENT_STREAM }
                )
            ).rejects.toThrow("HTTP 404");

            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain("404");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("should call onComplete when stream finishes", async () => {
        const sseBody = 'data: {"done":true}\n\n';
        const encoder = new TextEncoder();

        const mockStream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(sseBody));
                controller.close();
            },
        });

        const mockResponse = new Response(mockStream, { status: 200 });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn().mockResolvedValue(mockResponse);

        try {
            const adapter = new StreamingRequestAdapter(baseAdapter);
            let completed = false;

            const requestInfo = new RequestInformation();
            requestInfo.URL = "https://example.com/stream";
            requestInfo.httpMethod = HttpMethod.GET;

            await adapter.stream(requestInfo, {
                onComplete: () => {
                    completed = true;
                },
            });

            expect(completed).toBe(true);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe("collectStream utility", () => {
    const token = "test-token";
    const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
    const baseAdapter = new FetchRequestAdapter(authProvider);

    it("should collect all SSE chunks into an array", async () => {
        const sseBody = 'data: {"n":1}\n\ndata: {"n":2}\n\ndata: {"n":3}\n\n';
        const encoder = new TextEncoder();

        const mockStream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(sseBody));
                controller.close();
            },
        });

        const mockResponse = new Response(mockStream, { status: 200 });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn().mockResolvedValue(mockResponse);

        try {
            const streamingAdapter = createStreamingAdapter(baseAdapter);

            const requestInfo = new RequestInformation();
            requestInfo.URL = "https://example.com/sse";
            requestInfo.httpMethod = HttpMethod.GET;

            const results = await collectStream(streamingAdapter, requestInfo, {
                streamType: StreamingResponseType.TEXT_EVENT_STREAM,
            });

            expect(results).toHaveLength(3);
            expect(results).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// ─── Services Tests ─────────────────────────────────────────────────

describe("Service factories", () => {
    it("createDigitalOceanClient should return a valid ServiceClient", () => {
        const client = createDOServiceClient("test-api-key");

        expect(client.adapter).toBeInstanceOf(FetchRequestAdapter);
        expect(client.baseUrl).toBe("https://api.digitalocean.com/v2");
        expect(client.config.type).toBe(ServiceType.DIGITALOCEAN_API);
        expect(client.config.apiKey).toBe("test-api-key");
    });

    it("createServerlessInferenceClient should return a valid ServiceClient", () => {
        const client = createServerlessInferenceClient("inference-token");

        expect(client.adapter).toBeInstanceOf(FetchRequestAdapter);
        expect(client.baseUrl).toBe("https://inference.do-ai.run");
        expect(client.config.type).toBe(ServiceType.SERVERLESS_INFERENCE);
        expect(client.config.authToken).toBe("inference-token");
    });

    it("createServerlessInferenceClient should accept a custom base URL", () => {
        const client = createServerlessInferenceClient(
            "token",
            "https://custom-inference.example.com"
        );

        expect(client.baseUrl).toBe("https://custom-inference.example.com");
    });

    it("createServerlessInferenceClient should throw without a token", () => {
        expect(() => createServerlessInferenceClient("")).toThrow(
            "authToken is required"
        );
    });

    it("createAgentInferenceClient should normalize URL and append /api/v1", () => {
        const client = createAgentInferenceClient("my-agent.example.com");

        expect(client.baseUrl).toBe("https://my-agent.example.com/api/v1");
        expect(client.config.type).toBe(ServiceType.AGENT_INFERENCE);
    });

    it("createAgentInferenceClient should not double-add /api/v1", () => {
        const client = createAgentInferenceClient(
            "https://my-agent.example.com/api/v1"
        );

        expect(client.baseUrl).toBe("https://my-agent.example.com/api/v1");
    });

    it("createAgentInferenceClient should throw without a URL", () => {
        expect(() => createAgentInferenceClient("")).toThrow(
            "agentUrl is required"
        );
    });

    it("createAgentInferenceClient should work without auth token", () => {
        const client = createAgentInferenceClient("agent.example.com");

        expect(client.adapter).toBeInstanceOf(FetchRequestAdapter);
        expect(client.config.authToken).toBeUndefined();
    });
});

describe("ServiceManager", () => {
    it("should register and retrieve services", () => {
        const manager = new ServiceManager();
        const client = createDOServiceClient("key");

        manager.registerService("do-api", client);

        expect(manager.getService("do-api")).toBe(client);
        expect(manager.listServices()).toEqual(["do-api"]);
    });

    it("should return undefined for unregistered services", () => {
        const manager = new ServiceManager();

        expect(manager.getService("nonexistent")).toBeUndefined();
    });

    it("should remove a service", () => {
        const manager = new ServiceManager();
        const client = createDOServiceClient("key");

        manager.registerService("do-api", client);
        const removed = manager.removeService("do-api");

        expect(removed).toBe(true);
        expect(manager.getService("do-api")).toBeUndefined();
    });

    it("should list all registered services", () => {
        const manager = new ServiceManager();

        manager.registerService("a", createDOServiceClient("key-a"));
        manager.registerService("b", createServerlessInferenceClient("token-b"));

        expect(manager.listServices()).toEqual(["a", "b"]);
    });
});

describe("createServiceManager", () => {
    it("should create a manager with all three services", () => {
        const manager = createServiceManager({
            digitalOcean: "do-key",
            serverlessInference: { token: "inference-token" },
            agentInference: { url: "agent.example.com" },
        });

        expect(manager.getService("digitalocean")).toBeDefined();
        expect(manager.getService("serverless-inference")).toBeDefined();
        expect(manager.getService("agent-inference")).toBeDefined();
        expect(manager.listServices()).toHaveLength(3);
    });

    it("should create a manager with only DO API", () => {
        const manager = createServiceManager({
            digitalOcean: "do-key",
        });

        expect(manager.getService("digitalocean")).toBeDefined();
        expect(manager.getService("serverless-inference")).toBeUndefined();
        expect(manager.listServices()).toHaveLength(1);
    });

    it("should create an empty manager when no configs given", () => {
        const manager = createServiceManager({});

        expect(manager.listServices()).toHaveLength(0);
    });
});
