/**
 * Minimal image generation example.
 *
 * Run:
 *   DIGITALOCEAN_TOKEN=...  npx tsx examples/inference/image-generation.ts
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

const result = await client.images.generate({
    model: "stable-diffusion-3.5-large",
    prompt: "A friendly robot waving hello, flat illustration",
    n: 1,
    size: "1024x1024",
});

const img = result.data?.[0];
if (img?.url) {
    console.log(img.url);
} else if (img?.b64_json) {
    const fs = await import("node:fs");
    const path = "generated-image.png";
    fs.writeFileSync(path, Buffer.from(img.b64_json, "base64"));
    console.log(`Saved ${path} (${img.b64_json.length} base64 chars)`);
} else {
    console.log("Unexpected response shape:");
    console.dir(result, { depth: 4 });
}
