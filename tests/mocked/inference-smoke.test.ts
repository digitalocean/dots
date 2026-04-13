import nock from "nock";
import InferenceClient from "../../src/inference-gen/InferenceClient.js";
import { SSEStream } from "../../src/inference-gen/InferenceClient.js";

const BASE = "https://inference.do-ai.run";

describe("InferenceClient", () => {
    afterEach(() => nock.cleanAll());

    /* ─── responses.create ───────────────────────────────────────────── */

    it("responses.create — same shape as OpenAI readme", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/responses")
            .reply(200, {
                id: "resp-1",
                object: "response",
                output: [
                    {
                        type: "message",
                        role: "assistant",
                        content: [
                            { type: "output_text", text: "Ahoy! Semicolons be optional, matey!" },
                        ],
                    },
                ],
            });

        const response = await client.responses.create({
            model: "meta-llama/Meta-Llama-3.1-8B-Instruct",
            instructions: "You are a coding assistant that talks like a pirate",
            input: "Are semicolons optional in JavaScript?",
        });

        expect(response).toBeDefined();
        expect(response!.output_text).toBe("Ahoy! Semicolons be optional, matey!");
    });

    it("responses.create aggregates multiple output_text parts", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/responses")
            .reply(200, {
                id: "resp-2",
                object: "response",
                output: [
                    {
                        type: "message",
                        role: "assistant",
                        content: [
                            { type: "output_text", text: "Part 1. " },
                            { type: "output_text", text: "Part 2." },
                        ],
                    },
                ],
            });

        const response = await client.responses.create({
            model: "m",
            input: "hi",
        });

        expect(response!.output_text).toBe("Part 1. Part 2.");
    });

    /* ─── chat.completions.create ────────────────────────────────────── */

    it("chat.completions.create — same shape as OpenAI readme", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/chat/completions")
            .reply(200, {
                object: "chat.completion",
                choices: [
                    {
                        message: { role: "assistant", content: "Arr, they be optional!" },
                    },
                ],
            });

        const completion = await client.chat.completions.create({
            model: "meta-llama/Meta-Llama-3.1-8B-Instruct",
            messages: [
                { role: "developer", content: "Talk like a pirate." },
                { role: "user", content: "Are semicolons optional in JavaScript?" },
            ],
        });

        expect(completion).toBeDefined();
        expect(completion!.choices?.[0]?.message?.content).toBe("Arr, they be optional!");
    });

    /* ─── models.list ────────────────────────────────────────────────── */

    it("models.list — returns model data", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .get("/v1/models")
            .reply(200, {
                object: "list",
                data: [
                    { id: "llama3.3-70b-instruct", object: "model", owned_by: "meta" },
                    { id: "openai-gpt-oss-20b", object: "model", owned_by: "openai" },
                ],
            });

        const result = await client.models.list();

        expect(result).toBeDefined();
        expect(result!.data).toHaveLength(2);
        expect(result!.data![0]!.id).toBe("llama3.3-70b-instruct");
    });

    /* ─── images.generate ────────────────────────────────────────────── */

    it("images.generations.create — returns base64 data", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/images/generations")
            .reply(200, {
                created: 1700000000,
                data: [{ b64_json: "iVBORw0KGgo..." }],
            });

        const result = await client.images.generations.create({
            model: "openai-gpt-image-1",
            prompt: "A cute otter",
            n: 1,
            size: "256x256",
        });

        expect(result).toBeDefined();
        expect(result!.data?.[0]?.b64_json).toBe("iVBORw0KGgo...");
    });

    it("images.generate — OpenAI-style alias", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/images/generations")
            .reply(200, {
                created: 1700000000,
                data: [{ b64_json: "abc123" }],
            });

        const result = await client.images.generate({
            model: "openai-gpt-image-1",
            prompt: "A cat",
        });

        expect(result).toBeDefined();
        expect(result!.data?.[0]?.b64_json).toBe("abc123");
    });

    /* ─── streaming guards ───────────────────────────────────────────── */

    it("responses.create with stream: true returns SSEStream", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/responses")
            .reply(200, "data: [DONE]\n\n", { "Content-Type": "text/event-stream" });

        const result = await client.responses.create({
            model: "m",
            input: "hi",
            stream: true,
        });

        expect(result).toBeInstanceOf(SSEStream);
    });

    it("chat.completions.create with stream: true returns SSEStream", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/chat/completions")
            .reply(200, "data: [DONE]\n\n", { "Content-Type": "text/event-stream" });

        const result = await client.chat.completions.create({
            model: "m",
            messages: [{ role: "user", content: "hi" }],
            stream: true,
        });

        expect(result).toBeInstanceOf(SSEStream);
    });

    /* ─── constructor validation ─────────────────────────────────────── */

    it("throws on missing apiKey", () => {
        expect(() => new InferenceClient({ apiKey: "" })).toThrow("apiKey is required");
    });

    it("accepts custom baseURL", () => {
        const client = new InferenceClient({
            apiKey: "test-key",
            baseURL: "https://custom.inference.host/v1",
        });
        expect(client).toBeDefined();
    });

    /* ─── asyncInvoke.create ─────────────────────────────────────────── */

    it("asyncInvoke.create — fal model", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/async-invoke")
            .reply(200, {
                request_id: "abc-123",
                status: "QUEUED",
                model_id: "fal-ai/flux/schnell",
            });

        const result = await client.asyncInvoke.create({
            model_id: "fal-ai/flux/schnell",
            input: { prompt: "A futuristic city" },
        });

        expect(result).toBeDefined();
        expect(result!.request_id).toBe("abc-123");
    });

    /* ─── audio.generate ──────────────────────────────────────────────── */

    it("audio.generate — async audio generation", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/async-invoke", (body: Record<string, unknown>) => {
                expect(body.model_id).toBe("fal-ai/stable-audio-25/text-to-audio");
                const input = body.input as Record<string, unknown>;
                expect(input.prompt).toBe("ocean waves crashing");
                expect(input.seconds_total).toBe(10);
                return true;
            })
            .reply(200, { request_id: "audio-1", status: "QUEUED" });

        const res = await client.audio.generate({
            model_id: "fal-ai/stable-audio-25/text-to-audio",
            prompt: "ocean waves crashing",
            seconds_total: 10,
        });

        expect(res.request_id).toBe("audio-1");
        expect(res.status).toBe("QUEUED");
    });

    /* ─── audio.speech.create ─────────────────────────────────────────── */

    it("audio.speech.create — TTS", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/async-invoke", (body: Record<string, unknown>) => {
                expect(body.model_id).toBe("fal-ai/playai/tts/v3");
                const input = body.input as Record<string, unknown>;
                expect(input.text).toBe("Hello from DigitalOcean");
                return true;
            })
            .reply(200, { request_id: "tts-1", status: "QUEUED" });

        const res = await client.audio.speech.create({
            model_id: "fal-ai/playai/tts/v3",
            input: "Hello from DigitalOcean",
        });

        expect(res.request_id).toBe("tts-1");
    });

    /* ─── async_images.generate ───────────────────────────────────────── */

    it("async_images.generate — async image generation", async () => {
        const client = new InferenceClient({ apiKey: "test-key" });

        nock(BASE)
            .post("/v1/async-invoke", (body: Record<string, unknown>) => {
                expect(body.model_id).toBe("fal-ai/fast-sdxl");
                const input = body.input as Record<string, unknown>;
                expect(input.prompt).toBe("A cute otter");
                return true;
            })
            .reply(200, { request_id: "img-1", status: "QUEUED" });

        const res = await client.async_images.generate({
            model_id: "fal-ai/fast-sdxl",
            prompt: "A cute otter",
        });

        expect(res.request_id).toBe("img-1");
        expect(res.status).toBe("QUEUED");
    });
});
