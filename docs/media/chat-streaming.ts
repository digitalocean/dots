/**
 * Minimal streaming chat completion example.
 *
 * Run:
 *   DIGITALOCEAN_TOKEN=...  npx tsx examples/inference/chat-streaming.ts
 *
 * The token must be a full-access DigitalOcean PAT (or a Model Access Key).
 *
 * Imports use the new `@digitalocean/dots/inference` namespace. Inside this
 * repo we use the relative-path equivalent; downstream consumers replace the
 * relative path with `@digitalocean/dots/inference`:
 *
 *     import { Client } from "@digitalocean/dots/inference";
 *
 * The legacy `import { InferenceClient } from "@digitalocean/dots"` form is
 * still fully supported — Client and InferenceClient are the same constructor.
 */
import { Client } from "../../src/inference-gen/inference.js";

const apiKey = process.env.DIGITALOCEAN_TOKEN;
if (!apiKey) {
    throw new Error("DIGITALOCEAN_TOKEN not set");
}

const client = new Client({ apiKey });

const stream = await client.chat.completions.create({
    model: "llama3.3-70b-instruct",
    messages: [{ role: "user", content: "Write two short lines about DigitalOcean." }],
    stream: true,
});

for await (const chunk of stream) {
    process.stdout.write(chunk.choices?.[0]?.delta?.content ?? "");
}
process.stdout.write("\n");
