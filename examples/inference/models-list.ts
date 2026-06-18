/**
 * Minimal model listing example.
 *
 * Run:
 *   DIGITALOCEAN_TOKEN=...  npx tsx examples/inference/models-list.ts
 *
 * The token must be a full-access DigitalOcean PAT (or a Model Access Key).
 *
 * Imports use the new `@digitalocean/dots/inference` namespace. Downstream
 * consumers (after publish) write:
 *
 *     import { Client } from "@digitalocean/dots/inference";
 *
 * The legacy `import { InferenceClient } from "@digitalocean/dots"` import is
 * still supported — Client and InferenceClient are the same constructor.
 */
import { Client } from "../../src/inference-gen/inference.js";

const apiKey = process.env.DIGITALOCEAN_TOKEN;
if (!apiKey) {
    throw new Error("DIGITALOCEAN_TOKEN not set");
}

const client = new Client({ apiKey });

const models = await client.models.list();
for (const m of models.data ?? []) {
    console.log(m.id);
}
