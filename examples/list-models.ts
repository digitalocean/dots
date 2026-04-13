import dotenv from "dotenv";
import {
    createDigitalOceanClient,
    createServerlessInferenceClient,
} from "../index.js";

dotenv.config();

const token = process.env.DO_INFERENCE_TOKEN || process.env.INFERENCE_TOKEN;
if (!token) {
    throw new Error("Set DO_INFERENCE_TOKEN (or INFERENCE_TOKEN)");
}
const authToken: string = token;

const baseUrl = process.env.DO_INFERENCE_BASE_URL || "https://inference.do-ai.run";

async function main(): Promise<void> {
    const service = createServerlessInferenceClient(authToken, baseUrl);
    service.adapter.baseUrl = service.baseUrl;
    const client = createDigitalOceanClient(service.adapter);

    const res = await client.v1.models.get();
    const models = res?.data ?? [];

    console.log(`models: ${models.length}`);
    for (const model of models.slice(0, 25)) {
        console.log(`${model.id ?? "unknown"} (owner: ${model.ownedBy ?? "unknown"})`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
