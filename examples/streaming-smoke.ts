import dotenv from "dotenv";
import type { RequestInformation } from "@microsoft/kiota-abstractions";
import {
    createDigitalOceanClient,
    createServerlessInferenceClient,
    createStreamingAdapter,
    StreamingResponseType,
    type Chat_completion_request,
    type Create_image_request,
    type Create_response_request,
} from "../index.js";

dotenv.config();

const token = process.env.DO_INFERENCE_TOKEN || process.env.INFERENCE_TOKEN;
if (!token) {
    throw new Error("Set DO_INFERENCE_TOKEN (or INFERENCE_TOKEN)");
}
const authToken: string = token;

const baseUrl = process.env.DO_INFERENCE_BASE_URL || "https://inference.do-ai.run";
const model = process.env.DO_MODEL || "openai-gpt-4o-mini";
const prompt = process.env.DO_PROMPT || "Write one short sentence about DigitalOcean.";
const endpoint = (process.env.DO_STREAM_ENDPOINT || "responses").toLowerCase();
const format = (process.env.DO_STREAM_FORMAT || "text").toLowerCase();
const streamEnabled = (process.env.DO_STREAM ?? "true").toLowerCase() !== "false";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function printChunkRaw(chunk: unknown): void {
    if (typeof chunk === "string") {
        console.log(chunk);
        return;
    }
    if (isObjectRecord(chunk)) {
        const maybeType = chunk.type;
        if (typeof maybeType === "string") {
            console.log(`[${maybeType}]`, JSON.stringify(chunk));
            return;
        }
    }
    console.log(JSON.stringify(chunk));
}

function extractChatDeltaText(chunk: Record<string, unknown>): string | null {
    const choices = chunk.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        return null;
    }
    const first = choices[0];
    if (!isObjectRecord(first)) {
        return null;
    }
    const delta = first.delta;
    if (!isObjectRecord(delta)) {
        return null;
    }
    const content = delta.content;
    return typeof content === "string" ? content : null;
}

function extractResponsesDeltaText(chunk: Record<string, unknown>): string | null {
    const type = chunk.type;
    if (type === "response.output_text.delta" && typeof chunk.delta === "string") {
        return chunk.delta;
    }
    if (type === "response.output_text" && typeof chunk.text === "string") {
        return chunk.text;
    }
    return null;
}

function printChunkText(chunk: unknown): void {
    if (typeof chunk === "string") {
        if (chunk !== "[DONE]") {
            process.stdout.write(chunk);
        }
        return;
    }
    if (!isObjectRecord(chunk)) {
        return;
    }
    const chatDelta = extractChatDeltaText(chunk);
    if (chatDelta) {
        process.stdout.write(chatDelta);
        return;
    }
    const responseDelta = extractResponsesDeltaText(chunk);
    if (responseDelta) {
        process.stdout.write(responseDelta);
        return;
    }
    if (endpoint === "images") {
        process.stdout.write(".");
    }
}

async function main(): Promise<void> {
    const service = createServerlessInferenceClient(authToken, baseUrl);
    service.adapter.baseUrl = service.baseUrl;

    const client = createDigitalOceanClient(service.adapter);
    const streamingAdapter = createStreamingAdapter(service.adapter);

    if (!streamEnabled) {
        if (endpoint === "chat" || endpoint === "agent-chat") {
            const body = {
                model,
                stream: false,
                messages: [{ role: "user", content: prompt }],
            } as unknown as Chat_completion_request;
            const response =
                endpoint === "agent-chat"
                    ? await client.api.v1.chat.completions.post(body, {
                          queryParameters: { agent: true },
                      })
                    : await client.v1.chat.completions.post(body);
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        if (endpoint === "responses") {
            const body = {
                model,
                input: prompt,
                stream: false,
            } as unknown as Create_response_request;
            const response = await client.v1.responses.post(body);
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        if (endpoint === "images") {
            const imageBody = {
                model: process.env.DO_IMAGE_MODEL || "gpt-image-1",
                prompt,
                stream: false,
            } as unknown as Create_image_request;
            const response = await client.v1.images.generations.post(imageBody);
            console.log(JSON.stringify(response, null, 2));
            return;
        }
        throw new Error(
            "Unsupported DO_STREAM_ENDPOINT. Use: chat, agent-chat, responses, images"
        );
    }

    let requestInfo: RequestInformation;
    if (endpoint === "chat" || endpoint === "agent-chat") {
        const body = {
            model,
            stream: true,
            messages: [{ role: "user", content: prompt }],
        } as unknown as Chat_completion_request;
        requestInfo =
            endpoint === "agent-chat"
                ? client.api.v1.chat.completions.toPostRequestInformation(body, {
                      queryParameters: { agent: true },
                  })
                : client.v1.chat.completions.toPostRequestInformation(body);
        console.log(
            `Streaming from ${baseUrl}${
                endpoint === "agent-chat"
                    ? "/api/v1/chat/completions?agent=true"
                    : "/v1/chat/completions"
            }`
        );
    } else if (endpoint === "responses") {
        const body = {
            model,
            input: prompt,
            stream: true,
        } as unknown as Create_response_request;
        requestInfo = client.v1.responses.toPostRequestInformation(body);
        console.log(`Streaming from ${baseUrl}/v1/responses`);
    } else if (endpoint === "images") {
        const imageBody = {
            model: process.env.DO_IMAGE_MODEL || "gpt-image-1",
            prompt,
            stream: true,
            partialImages: 1,
        } as unknown as Create_image_request;
        requestInfo = client.v1.images.generations.toPostRequestInformation(imageBody);
        console.log(`Streaming from ${baseUrl}/v1/images/generations`);
    } else {
        throw new Error(
            "Unsupported DO_STREAM_ENDPOINT. Use: chat, agent-chat, responses, images"
        );
    }

    try {
        await streamingAdapter.stream(
            requestInfo,
            {
                onData: (chunk) => {
                    if (format === "raw") {
                        printChunkRaw(chunk);
                    } else {
                        printChunkText(chunk);
                    }
                },
                onError: (error) => console.error("stream error:", error.message),
                onComplete: () => {
                    if (format !== "raw") {
                        process.stdout.write("\n");
                    }
                    console.log("stream complete");
                },
            },
            {
                streamType: StreamingResponseType.TEXT_EVENT_STREAM,
                parseJsonLines: true,
            }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (endpoint === "responses" && message.includes("HTTP 404")) {
            console.error(
                "Hint: this base URL may not expose /v1/responses. Try DO_STREAM_ENDPOINT=chat."
            );
        }
        if (endpoint === "images" && message.includes("HTTP 404")) {
            console.error(
                "Hint: this base URL may not expose /v1/images/generations for your token."
            );
        }
        throw error;
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
