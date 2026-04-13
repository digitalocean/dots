import dotenv from "dotenv";
import {
    createDigitalOceanClient,
    createServerlessInferenceClient,
    type Async_invoke_request,
} from "../index.js";

dotenv.config();

const token = process.env.DO_INFERENCE_TOKEN || process.env.INFERENCE_TOKEN;
if (!token) {
    throw new Error("Set DO_INFERENCE_TOKEN (or INFERENCE_TOKEN)");
}

const baseUrl = process.env.DO_INFERENCE_BASE_URL || "https://inference.do-ai.run";
const modelId =
    process.env.DO_ASYNC_MODEL_ID || "fal-ai/stable-audio-25/text-to-audio";
const prompt =
    process.env.DO_ASYNC_PROMPT || "Techno song with futuristic sounds";
const secondsTotal = Number(process.env.DO_ASYNC_SECONDS_TOTAL || "60");
const tagKey = process.env.DO_ASYNC_TAG_KEY || "type";
const tagValue = process.env.DO_ASYNC_TAG_VALUE || "test";

async function main(): Promise<void> {
    const service = createServerlessInferenceClient(token, baseUrl);
    service.adapter.baseUrl = service.baseUrl;
    const client = createDigitalOceanClient(service.adapter);

    const body = {
        modelId,
        input: {
            prompt,
            secondsTotal,
        },
        tags: [{ key: tagKey, value: tagValue }],
    } as unknown as Async_invoke_request;

    const response = await client.v1.asyncInvoke.post(body);
    console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
