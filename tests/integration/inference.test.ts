import dotenv from "dotenv";
import InferenceClient from "../../src/inference-gen/InferenceClient.js";
import { SSEStream } from "../../src/inference-gen/InferenceClient.js";

dotenv.config();

const apiKey = process.env.MODEL_ACCESS_KEY;
if (!apiKey) {
    throw new Error("MODEL_ACCESS_KEY is not set. Please check your .env file.");
}

const client = new InferenceClient({ apiKey });

let CHAT_MODEL = process.env.DO_CHAT_MODEL ?? "openai-gpt-oss-20b";
let RESPONSES_MODEL = process.env.DO_RESPONSES_MODEL ?? "openai-gpt-oss-20b";

describe("Inference Integration Tests", () => {

    /* ─── /v1/models ─────────────────────────────────────────────────── */

    describe("models.list", () => {
        it("returns a list of available models with expected shape", async () => {
            const result = await client.models.list();

            // Auto-discover models for subsequent tests if not set via env.
            // Prefer non-reasoning models (reasoning models return content as object, not string).
            if (Array.isArray(result.data)) {
                const ids: string[] = result.data.map((m: Record<string, unknown>) => m.id as string);
                const skip = (id: string) =>
                    id.includes("deepseek-r1") || id.includes("reasoning") || id.includes("embed");

                if (!CHAT_MODEL) {
                    const pick = ids.find(id => !skip(id) && (id.includes("llama") || id.includes("instruct")))
                        ?? ids.find(id => !skip(id))
                        ?? ids[0];
                    CHAT_MODEL = pick;
                }
                if (!RESPONSES_MODEL) {
                    RESPONSES_MODEL = CHAT_MODEL;
                }
            }
            console.log(`Using CHAT_MODEL=${CHAT_MODEL}, RESPONSES_MODEL=${RESPONSES_MODEL}`);

            expect(result).toBeDefined();
            expect(result.object).toBe("list");
            expect(Array.isArray(result.data)).toBe(true);
            expect(result.data.length).toBeGreaterThan(0);

            const first = result.data[0];
            expect(first.id).toBeDefined();
            expect(typeof first.id).toBe("string");
            expect(first.object).toBe("model");
            expect(typeof first.owned_by).toBe("string");
        }, 30000);
    });

    /* ─── /v1/chat/completions (non-streaming) ───────────────────────── */

    describe("chat.completions.create", () => {
        it("returns a completion with choices[0].message.content", async () => {
            const completion = await client.chat.completions.create({
                model: CHAT_MODEL,
                messages: [
                    { role: "user", content: "Reply with exactly: INTEGRATION_OK" },
                ],
                max_tokens: 20,
            });

            expect(completion).toBeDefined();
            expect(completion.id).toBeDefined();
            expect(completion.object).toBe("chat.completion");
            expect(Array.isArray(completion.choices)).toBe(true);
            expect(completion.choices.length).toBeGreaterThan(0);

            const msg = completion.choices[0].message;
            expect(msg.role).toBe("assistant");
            expect(msg.content).toBeDefined();
            // content is a string for standard models, may be array/object for reasoning models
            if (typeof msg.content === "string") {
                expect(msg.content.length).toBeGreaterThan(0);
            }

            // snake_case fields preserved (not camelCase)
            expect(completion.choices[0].finish_reason).toBeDefined();
        }, 30000);

        it("streaming returns an async iterable SSEStream with delta chunks", async () => {
            const stream = await client.chat.completions.create({
                model: CHAT_MODEL,
                messages: [
                    { role: "user", content: "Say hello in one word." },
                ],
                max_tokens: 10,
                stream: true,
            });

            expect(stream).toBeInstanceOf(SSEStream);

            let chunkCount = 0;
            for await (const _chunk of stream as SSEStream) {
                chunkCount++;
            }

            expect(chunkCount).toBeGreaterThan(0);
        }, 30000);

        it("streaming with callbacks delivers chunks via onData", async () => {
            let chunkCount = 0;
            let completeCalled = false;

            await client.chat.completions.create(
                {
                    model: CHAT_MODEL,
                    messages: [{ role: "user", content: "Say hi." }],
                    max_tokens: 10,
                    stream: true,
                },
                {
                    onData: () => { chunkCount++; },
                    onComplete: () => { completeCalled = true; },
                },
            );

            expect(chunkCount).toBeGreaterThan(0);
            expect(completeCalled).toBe(true);
        }, 30000);
    });

    /* ─── /v1/responses (non-streaming) ──────────────────────────────── */

    describe("responses.create", () => {
        it("returns a response with aggregated output_text", async () => {
            let response: Record<string, unknown> | undefined;
            try {
                response = await client.responses.create({
                    model: RESPONSES_MODEL,
                    input: "Reply with exactly: INTEGRATION_OK",
                });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "";
                if (msg.includes("401") || msg.includes("403") || msg.includes("404") || msg.includes("not available")) {
                    console.warn(`responses.create skipped: ${msg.slice(0, 80)}`);
                    return;
                }
                throw err;
            }

            expect(response).toBeDefined();
            expect(response!.id).toBeDefined();
            expect(typeof response!.output_text).toBe("string");
            expect((response!.output_text as string).length).toBeGreaterThan(0);

            expect(Array.isArray(response!.output)).toBe(true);
            const output = response!.output as Array<Record<string, unknown>>;
            expect(output.length).toBeGreaterThan(0);
            const respMsg = output.find((o) => o.type === "message");
            expect(respMsg).toBeDefined();
            expect(respMsg!.role).toBe("assistant");
            expect(Array.isArray(respMsg!.content)).toBe(true);
        }, 30000);

        it("streaming returns SSEStream with event objects", async () => {
            let stream: SSEStream | undefined;
            try {
                stream = await client.responses.create({
                    model: RESPONSES_MODEL,
                    input: "Say hello in one word.",
                    stream: true,
                }) as SSEStream;
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "";
                if (msg.includes("401") || msg.includes("403") || msg.includes("404") || msg.includes("not available")) {
                    console.warn(`responses.create streaming skipped: ${msg.slice(0, 80)}`);
                    return;
                }
                throw err;
            }

            expect(stream).toBeInstanceOf(SSEStream);

            let eventCount = 0;
            try {
                for await (const _event of stream!) {
                    eventCount++;
                }
            } catch (iterErr: unknown) {
                const msg = iterErr instanceof Error ? iterErr.message : "";
                if (msg.includes("401") || msg.includes("403") || msg.includes("404") || msg.includes("not available")) {
                    console.warn(`responses.create streaming skipped: ${msg.slice(0, 80)}`);
                    return;
                }
                throw iterErr;
            }

            expect(eventCount).toBeGreaterThan(0);
        }, 30000);
    });

    /* ─── /v1/async-invoke ───────────────────────────────────────────── */

    describe("asyncInvoke.create", () => {
        it("queues a request and returns a request_id", async () => {
            let result: Record<string, unknown> | undefined;
            try {
                result = await client.asyncInvoke.create({
                    model_id: "fal-ai/flux/schnell",
                    input: { prompt: "A tiny shark" },
                });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "";
                if (msg.includes("401") || msg.includes("403") || msg.includes("404")) {
                    console.warn("asyncInvoke skipped: model not available for this key");
                    return;
                }
                throw err;
            }

            expect(result).toBeDefined();
            expect(typeof result!.request_id).toBe("string");
            expect((result!.request_id as string).length).toBeGreaterThan(0);
        }, 60000);
    });

    /* ─── snake_case verification ────────────────────────────────────── */

    describe("snake_case field preservation", () => {
        it("chat completion response uses snake_case, not camelCase", async () => {
            const completion = await client.chat.completions.create({
                model: CHAT_MODEL,
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 5,
            });

            const raw = JSON.stringify(completion);

            // Should have snake_case
            expect(raw).toContain("finish_reason");
            // Should NOT have camelCase equivalents
            expect(raw).not.toContain("finishReason");
        }, 30000);

        it("models response uses snake_case owned_by", async () => {
            const models = await client.models.list();
            const raw = JSON.stringify(models);

            expect(raw).toContain("owned_by");
            expect(raw).not.toContain("ownedBy");
        }, 30000);
    });
});
