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
const endpoint = (process.env.DO_STREAM_ENDPOINT || "chat").toLowerCase();
const model = process.env.DO_MODEL || "llama3.3-70b-instruct";
const prompt = process.env.DO_PROMPT || "Write two short lines about DigitalOcean.";
const streamEnabled = (process.env.DO_STREAM ?? "true").toLowerCase() !== "false";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function printStreamChunk(chunk: unknown): void {
    if (typeof chunk === "string") {
        if (chunk !== "[DONE]") {
            process.stdout.write(chunk);
        }
        return;
    }
    if (!isObjectRecord(chunk)) {
        return;
    }
    const choices = chunk.choices;
    if (Array.isArray(choices) && choices.length > 0) {
        const first = choices[0];
        if (isObjectRecord(first) && isObjectRecord(first.delta)) {
            const content = first.delta.content;
            if (typeof content === "string") {
                process.stdout.write(content);
                return;
            }
        }
    }
    if (chunk.type === "response.output_text.delta" && typeof chunk.delta === "string") {
        process.stdout.write(chunk.delta);
    }
}

async function runNonStreaming(client: ReturnType<typeof createDigitalOceanClient>) {
    if (endpoint === "chat") {
        const body = {
            model,
            stream: false,
            messages: [{ role: "user", content: prompt }],
        } as unknown as Chat_completion_request;
        const response = await client.v1.chat.completions.post(body);
        console.log(JSON.stringify(response, null, 2));
        return;
    }

    if (endpoint === "agent-chat") {
        const body = {
            model,
            stream: false,
            messages: [{ role: "user", content: prompt }],
        } as unknown as Chat_completion_request;
        const response = await client.api.v1.chat.completions.post(body, {
            queryParameters: { agent: true },
        });
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
        const body = {
            model: process.env.DO_IMAGE_MODEL || "gpt-image-1",
            prompt,
            stream: false,
        } as unknown as Create_image_request;
        const response = await client.v1.images.generations.post(body);
        console.log(JSON.stringify(response, null, 2));
        return;
    }

    throw new Error("Unsupported DO_STREAM_ENDPOINT. Use chat, agent-chat, responses, images");
}

async function runStreaming(
    client: ReturnType<typeof createDigitalOceanClient>,
    streamingAdapter: ReturnType<typeof createStreamingAdapter>
) {
    let requestInfo: RequestInformation;
    let url = "";

    if (endpoint === "chat") {
        const body = {
            model,
            stream: true,
            messages: [{ role: "user", content: prompt }],
        } as unknown as Chat_completion_request;
        requestInfo = client.v1.chat.completions.toPostRequestInformation(body);
        url = `${baseUrl}/v1/chat/completions`;
    } else if (endpoint === "agent-chat") {
        const body = {
            model,
            stream: true,
            messages: [{ role: "user", content: prompt }],
        } as unknown as Chat_completion_request;
        requestInfo = client.api.v1.chat.completions.toPostRequestInformation(body, {
            queryParameters: { agent: true },
        });
        url = `${baseUrl}/api/v1/chat/completions?agent=true`;
    } else if (endpoint === "responses") {
        const body = {
            model,
            input: prompt,
            stream: true,
        } as unknown as Create_response_request;
        requestInfo = client.v1.responses.toPostRequestInformation(body);
        url = `${baseUrl}/v1/responses`;
    } else if (endpoint === "images") {
        const body = {
            model: process.env.DO_IMAGE_MODEL || "gpt-image-1",
            prompt,
            stream: true,
            partialImages: 1,
        } as unknown as Create_image_request;
        requestInfo = client.v1.images.generations.toPostRequestInformation(body);
        url = `${baseUrl}/v1/images/generations`;
    } else {
        throw new Error("Unsupported DO_STREAM_ENDPOINT. Use chat, agent-chat, responses, images");
    }

    console.log(`Streaming from ${url}`);
    await streamingAdapter.stream(
        requestInfo,
        {
            onData: printStreamChunk,
            onError: (error) => console.error("stream error:", error.message),
            onComplete: () => {
                process.stdout.write("\n");
                console.log("stream complete");
            },
        },
        {
            streamType: StreamingResponseType.TEXT_EVENT_STREAM,
            parseJsonLines: true,
        }
    );
}

async function main(): Promise<void> {
    const service = createServerlessInferenceClient(authToken, baseUrl);
    service.adapter.baseUrl = service.baseUrl;
    const client = createDigitalOceanClient(service.adapter);
    const streamingAdapter = createStreamingAdapter(service.adapter);

    if (!streamEnabled) {
        await runNonStreaming(client);
        return;
    }

    await runStreaming(client, streamingAdapter);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
