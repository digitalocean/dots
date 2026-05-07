/**
 * Minimal model listing example.
 *
 * Run:
 *   DIGITALOCEAN_TOKEN=...  npx tsx examples/inference/models-list.ts
 *
 * The token must be a full-access DigitalOcean PAT (or a Model Access Key).
 */
import { InferenceClient } from "../../index.js";

const apiKey = process.env.DIGITALOCEAN_TOKEN;
if (!apiKey) {
    throw new Error("DIGITALOCEAN_TOKEN not set");
}

const client = new InferenceClient({ apiKey });

const models = await client.models.list();
for (const m of models.data ?? []) {
    console.log(m.id);
}
