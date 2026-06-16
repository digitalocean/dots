/**
 * Public namespace barrel for the `@digitalocean/dots/inference` subpath.
 *
 * This file is HAND-WRITTEN and intentionally kept thin. It re-exports the
 * auto-generated `InferenceClient` (regenerated from the OpenAPI spec by
 * `scripts/postgen-inference.mjs`) under cleaner namespace-local names so
 * consumers can write:
 *
 *   import { Client } from "@digitalocean/dots/inference";
 *   const c = new Client({ apiKey: process.env.MODEL_ACCESS_KEY });
 *   await c.chat.completions.create({ model, messages });
 *
 * Or namespace-style:
 *
 *   import * as inference from "@digitalocean/dots/inference";
 *   const c = new inference.Client({ apiKey });
 *
 * Or default-style (mirrors the existing root default export):
 *
 *   import Client from "@digitalocean/dots/inference";
 *
 * Every existing import path continues to work unchanged:
 *
 *   import { InferenceClient } from "@digitalocean/dots";          // legacy
 *   import { InferenceClient } from "@digitalocean/dots/inference"; // also works
 *
 * Auto-inclusion: because this barrel re-exports `*` from the regenerated
 * `InferenceClient`, any new endpoint added to the OpenAPI spec (and picked
 * up by `postgen-inference.mjs` on the next `make generate`) is automatically
 * reachable as `inference.Client.<group>.<method>(...)` with no edits here.
 */

export {
    InferenceClient,
    InferenceClient as Client,
    SSEStream,
    type InferenceClientOptions,
    type InferenceClientOptions as ClientOptions,
    type InferenceStreamCallbacks,
    type InferenceStreamCallbacks as StreamCallbacks,
} from "./InferenceClient.js";

export {
    createDigitalOceanInferenceClient,
    createDigitalOceanInferenceClient as createClient,
    DEFAULT_INFERENCE_BASE_URL,
    INFERENCE_OPENAPI_PATHS,
    normalizeInferenceBaseUrl,
} from "./index.js";

export { default } from "./InferenceClient.js";
