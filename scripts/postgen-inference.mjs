#!/usr/bin/env node
/**
 * Post-Kiota step: read the bundled OpenAPI YAML and emit:
 *   1. src/inference-gen/index.ts       — paths, base URL, factory (Kiota-based, for v1.* usage)
 *   2. src/inference-gen/InferenceClient.ts — OpenAI-compatible wrapper (standalone, no Kiota)
 *
 * The InferenceClient uses direct fetch() — NOT Kiota — so responses keep their
 * native snake_case field names matching the OpenAI Node SDK exactly.
 *
 * Everything is auto-derived from the spec:
 *   • Paths come from x-inference-base-url or "Serverless Inference"/"inference" tags
 *   • Method names come from HTTP verbs (POST → create, GET → list)
 *   • Group nesting comes from path segments
 *   • Streaming support detected from request schema having a `stream` property
 *   • output_text aggregation detected from response schema having an `output` array
 *
 * No hardcoded endpoint registry. When a new path lands in the spec, the wrapper
 * picks it up automatically on the next `make generate`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dotsRoot = path.resolve(__dirname, "..");
const outDir = path.join(dotsRoot, "src", "inference-gen");

const FALLBACK_INFERENCE_HOST = "https://inference.do-ai.run";

/* ─────────────────────────── spec parsing ─────────────────────────── */

const specPath = process.argv[2];
if (!specPath) {
    console.error("Usage: node scripts/postgen-inference.mjs <path-to-openapi.yaml>");
    process.exit(1);
}
const resolvedSpec = path.resolve(specPath);
if (!fs.existsSync(resolvedSpec)) {
    console.error(`postgen-inference: spec not found: ${resolvedSpec}`);
    process.exit(1);
}

const raw = fs.readFileSync(resolvedSpec, "utf8");
const doc = yaml.parse(raw);

/* ───────────── helpers ───────────── */

function resolveRef(ref) {
    if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
    let obj = doc;
    for (const p of ref.substring(2).split("/")) obj = obj?.[p];
    return obj ?? null;
}

function resolveSchema(schemaOrRef) {
    if (!schemaOrRef) return null;
    if (schemaOrRef.$ref) return resolveRef(schemaOrRef.$ref);
    return schemaOrRef;
}

function segmentToCamel(seg) {
    return seg.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/* ───────── 1. collect inference paths & base URLs ───────── */

const pathSet = new Set();
const baseUrls = new Set();

function addBaseUrlFromServers(op) {
    for (const s of op.servers ?? []) {
        const u = s?.url;
        if (typeof u === "string" && u.trim() && !u.includes("{")) {
            baseUrls.add(u.trim().replace(/\/+$/, ""));
            return;
        }
    }
}

function isServerlessInferenceOp(op) {
    if (!op || typeof op !== "object") return false;
    const x = op["x-inference-base-url"];
    if (typeof x === "string" && x.trim() && !x.includes("{")) return true;
    const tags = op.tags;
    if (Array.isArray(tags) && tags.some(t =>
        typeof t === "string" && t.toLowerCase() === "serverless inference"
    )) return true;
    for (const s of op.servers ?? []) {
        const u = s?.url;
        if (typeof u === "string" && u.includes("inference") && !u.includes("{")) return true;
    }
    return false;
}

for (const [pkey, pathItem] of Object.entries(doc.paths ?? {})) {
    if (typeof pathItem !== "object" || pathItem === null) continue;
    for (const method of ["get", "post", "put", "patch", "delete"]) {
        const op = pathItem[method];
        if (!isServerlessInferenceOp(op)) continue;
        pathSet.add(pkey);
        const x = op["x-inference-base-url"];
        if (typeof x === "string" && x.trim()) {
            baseUrls.add(x.trim().replace(/\/+$/, ""));
        }
        addBaseUrlFromServers(op);
        break;
    }
}

const paths = [...pathSet].sort();
const defaultBaseUrl = baseUrls.has(FALLBACK_INFERENCE_HOST)
    ? FALLBACK_INFERENCE_HOST
    : [...baseUrls].sort()[0] ?? FALLBACK_INFERENCE_HOST;

if (paths.length === 0) {
    console.warn("postgen-inference: no inference paths found; emitting empty.");
}

/* ──────── 2. build endpoint descriptors from the spec ──────── */

function getRequestBodySchema(op) {
    let rb = op?.requestBody;
    if (rb?.$ref) rb = resolveRef(rb.$ref);
    return resolveSchema(rb?.content?.["application/json"]?.schema);
}

function getResponseSchema(op) {
    for (const code of ["200", "201", "202"]) {
        let resp = op?.responses?.[code];
        if (!resp) continue;
        if (resp.$ref) resp = resolveRef(resp.$ref);
        const s = resolveSchema(resp?.content?.["application/json"]?.schema);
        if (s) return s;
    }
    return null;
}

const endpoints = [];

for (const p of paths) {
    const pathItem = doc.paths[p];
    for (const httpMethod of ["get", "post", "put", "patch", "delete"]) {
        const op = pathItem?.[httpMethod];
        if (!isServerlessInferenceOp(op)) continue;

        const reqSchema = getRequestBodySchema(op);
        const resSchema = getResponseSchema(op);
        const supportsStreaming = reqSchema?.properties?.stream !== undefined;
        const hasOutputArray = resSchema?.properties?.output?.type === "array";

        // Derive group parts: /v1/chat/completions → ["chat","completions"]
        const segments = p.replace(/^\/v1\//, "").split("/").map(segmentToCamel);
        const methodName = httpMethod === "get" ? "list" : "create";

        endpoints.push({
            path: p,
            httpMethod,
            segments,         // property nesting on InferenceClient
            methodName,
            supportsStreaming,
            hasOutputArray,   // needs output_text aggregation
        });

        break; // one method per path
    }
}

/* ───────── 3. emit src/inference-gen/index.ts ───────── */

const specBasename = path.basename(resolvedSpec);

const indexBody = `/* eslint-disable */
/* tslint:disable */
/**
 * AUTO-GENERATED by scripts/postgen-inference.mjs — do not edit.
 * Regenerate: \`SPEC_FILE=... make generate\` (runs after Kiota).
 * Source spec: ${specBasename}
 */

import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../dots/DigitalOceanApiKeyAuthenticationProvider.js";

export const INFERENCE_OPENAPI_PATHS = ${JSON.stringify(paths, null, 4)} as const;

export const DEFAULT_INFERENCE_BASE_URL = ${JSON.stringify(defaultBaseUrl)};

export function normalizeInferenceBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\\/+$/, "").replace(/\\/v1$/i, "");
}

export function createDigitalOceanInferenceClient(
    modelAccessKey: string,
    baseUrl: string = DEFAULT_INFERENCE_BASE_URL,
): ReturnType<typeof createDigitalOceanClient> {
    const authProvider = new DigitalOceanApiKeyAuthenticationProvider(modelAccessKey);
    const adapter = new FetchRequestAdapter(authProvider);
    adapter.baseUrl = normalizeInferenceBaseUrl(baseUrl);
    return createDigitalOceanClient(adapter);
}
`;

/* ───────── 4. emit src/inference-gen/InferenceClient.ts ───────── */

// Build a tree from segments → endpoint
// e.g. ["chat","completions"] → { chat: { completions: { __ep: {...} } } }
const tree = {};
for (const ep of endpoints) {
    let node = tree;
    for (let i = 0; i < ep.segments.length; i++) {
        const seg = ep.segments[i];
        if (!node[seg]) node[seg] = {};
        if (i === ep.segments.length - 1) {
            node[seg].__ep = ep;
        } else {
            if (!node[seg].__children) node[seg].__children = {};
            node = node[seg].__children;
        }
    }
}

function emitMethodBody(ep, indent) {
    const q = JSON.stringify(ep.path);
    if (ep.httpMethod === "get") {
        return (
            `${indent}${ep.methodName}: async (): Promise<any> => {\n` +
            `${indent}    return this._fetch(${q}, "GET");\n` +
            `${indent}},\n`
        );
    }
    if (ep.supportsStreaming && ep.hasOutputArray) {
        return (
            `${indent}${ep.methodName}: async (\n` +
            `${indent}    params: Record<string, any>,\n` +
            `${indent}    streamCallbacks?: InferenceStreamCallbacks,\n` +
            `${indent}): Promise<any> => {\n` +
            `${indent}    if (params.stream === true) {\n` +
            `${indent}        const s = this._sse(${q}, params);\n` +
            `${indent}        if (streamCallbacks?.onData) { await s.consume(streamCallbacks); return; }\n` +
            `${indent}        return s;\n` +
            `${indent}    }\n` +
            `${indent}    const res = await this._fetch(${q}, "POST", params);\n` +
            `${indent}    let _ot = "";\n` +
            `${indent}    if (Array.isArray(res?.output)) {\n` +
            `${indent}        for (const item of res.output) {\n` +
            `${indent}            if (item?.type === "message" && Array.isArray(item.content)) {\n` +
            `${indent}                for (const part of item.content) {\n` +
            `${indent}                    if (part?.type === "output_text" && typeof part.text === "string") _ot += part.text;\n` +
            `${indent}                }\n` +
            `${indent}            }\n` +
            `${indent}        }\n` +
            `${indent}    }\n` +
            `${indent}    res.output_text = _ot;\n` +
            `${indent}    return res;\n` +
            `${indent}},\n`
        );
    }
    if (ep.supportsStreaming) {
        return (
            `${indent}${ep.methodName}: async (\n` +
            `${indent}    params: Record<string, any>,\n` +
            `${indent}    streamCallbacks?: InferenceStreamCallbacks,\n` +
            `${indent}): Promise<any> => {\n` +
            `${indent}    if (params.stream === true) {\n` +
            `${indent}        const s = this._sse(${q}, params);\n` +
            `${indent}        if (streamCallbacks?.onData) { await s.consume(streamCallbacks); return; }\n` +
            `${indent}        return s;\n` +
            `${indent}    }\n` +
            `${indent}    return this._fetch(${q}, "POST", params);\n` +
            `${indent}},\n`
        );
    }
    return (
        `${indent}${ep.methodName}: async (params: Record<string, any>): Promise<any> => {\n` +
        `${indent}    return this._fetch(${q}, "POST", params);\n` +
        `${indent}},\n`
    );
}

// Recursively emit the property tree
function emitNode(obj, depth) {
    let out = "";
    const baseIndent = "    ".repeat(depth + 1);
    for (const [key, node] of Object.entries(obj)) {
        if (key.startsWith("__")) continue;
        const ep = node.__ep;
        const children = node.__children;
        const hasChildren = children && Object.keys(children).length > 0;

        if (depth === 0) {
            out += `    public readonly ${key} = {\n`;
        } else {
            out += `${baseIndent}${key}: {\n`;
        }

        if (ep) out += emitMethodBody(ep, baseIndent + "    ");
        if (hasChildren) out += emitNode(children, depth + 1);
        // Inject OpenAI-compat aliases into specific groups
        if (key === "images" && imagesAliasCode) out += imagesAliasCode + "\n";

        if (depth === 0) {
            out += `    };\n\n`;
        } else {
            out += `${baseIndent}},\n`;
        }
    }
    return out;
}

/* ─── OpenAI-compat aliases (detected before tree emission) ─── */

// /v1/images/generations → images.generations.create in the tree,
// but OpenAI uses client.images.generate(). Add an alias inside `images`.
const imagesGenPath = paths.find(p => p === "/v1/images/generations");
let imagesAliasCode = "";
if (imagesGenPath) {
    imagesAliasCode = `
        /** Alias matching OpenAI's \`client.images.generate(...)\`. */
        generate: async (
            params: Record<string, any>,
            streamCallbacks?: InferenceStreamCallbacks,
        ): Promise<any> => {
            return this.images.generations.create(params, streamCallbacks);
        },`;
}

const methodsCode = emitNode(tree, 0);

/* ─── async-invoke convenience aliases ─── */
// /v1/async-invoke is one path but supports 3 use-cases (image, audio, TTS)
// with different input shapes. Detect it from the spec and emit typed wrappers.

const asyncInvokePath = paths.find(p => p === "/v1/async-invoke");
let asyncAliasCode = "";
if (asyncInvokePath) {
    asyncAliasCode = `
    public readonly audio = {
        /** Async audio generation (e.g. fal-ai/stable-audio-25/text-to-audio). */
        generate: async (params: { model_id: string; prompt: string; seconds_total?: number; [k: string]: any }): Promise<any> => {
            return this._fetch("/v1/async-invoke", "POST", {
                model_id: params.model_id,
                input: { prompt: params.prompt, seconds_total: params.seconds_total },
            });
        },
        speech: {
            /** Text-to-speech (e.g. fal-ai/playai/tts/v3). */
            create: async (params: { model_id: string; input: string; [k: string]: any }): Promise<any> => {
                return this._fetch("/v1/async-invoke", "POST", {
                    model_id: params.model_id,
                    input: { text: params.input },
                });
            },
        },
    };

    public readonly async_images = {
        /** Async image generation (e.g. fal-ai/fast-sdxl, fal-ai/flux/schnell). */
        generate: async (params: { model_id: string; prompt: string; num_images?: number; num_inference_steps?: number; guidance_scale?: number; output_format?: string; enable_safety_checker?: boolean; [k: string]: any }): Promise<any> => {
            return this._fetch("/v1/async-invoke", "POST", {
                model_id: params.model_id,
                input: {
                    prompt: params.prompt,
                    num_images: params.num_images,
                    num_inference_steps: params.num_inference_steps,
                    guidance_scale: params.guidance_scale,
                    output_format: params.output_format,
                    enable_safety_checker: params.enable_safety_checker,
                },
            });
        },
    };
`;
}

const clientBody = `/* eslint-disable */
/* tslint:disable */
/**
 * AUTO-GENERATED by scripts/postgen-inference.mjs — do not edit.
 * Regenerate: \`SPEC_FILE=... make generate\` (runs after Kiota).
 *
 * OpenAI-compatible wrapper for DigitalOcean Serverless Inference.
 *
 * This client uses direct fetch() — NOT Kiota — so every response keeps its
 * native snake_case field names exactly as the OpenAI Node SDK returns them.
 * V2 control-plane endpoints are completely unaffected.
 *
 * Usage mirrors the \`openai\` Node SDK:
 *
 *   import { InferenceClient } from "@digitalocean/dots";
 *   const client = new InferenceClient({ apiKey: process.env.MODEL_ACCESS_KEY });
 *
 *   const completion = await client.chat.completions.create({
 *       model: "llama3.3-70b-instruct",
 *       messages: [{ role: "user", content: "Hello!" }],
 *   });
 *   console.log(completion.choices[0].message.content);
 *
 *   const response = await client.responses.create({
 *       model: "openai-gpt-oss-20b",
 *       input: "Are semicolons optional in JavaScript?",
 *   });
 *   console.log(response.output_text);
 *
 *   // Streaming — async iterable (same as OpenAI)
 *   const stream = await client.chat.completions.create({ model, messages, stream: true });
 *   for await (const chunk of stream) { process.stdout.write(chunk.choices?.[0]?.delta?.content ?? ""); }
 *
 *   // Streaming — callbacks (also supported)
 *   await client.chat.completions.create(
 *       { model, messages, stream: true },
 *       { onData: (chunk) => { ... }, onComplete: () => { ... } },
 *   );
 */

const DEFAULT_INFERENCE_BASE_URL = ${JSON.stringify(defaultBaseUrl)};

function normalizeInferenceBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\\/+$/, "").replace(/\\/v1$/i, "");
}

export interface InferenceClientOptions {
    apiKey: string;
    baseURL?: string;
}

export interface InferenceStreamCallbacks {
    onData?: (data: any) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
}

/**
 * Async-iterable SSE stream — enables \`for await (const chunk of stream)\`.
 */
export class SSEStream implements AsyncIterable<any> {
    private readonly _q: Array<{ v: any } | { e: Error }> = [];
    private _done = false;
    private _wake: (() => void) | null = null;

    /** @internal */
    constructor(url: string, apiKey: string, body: any) {
        this._run(url, apiKey, body);
    }

    private async _run(url: string, apiKey: string, body: any): Promise<void> {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error("HTTP " + res.status + ": " + res.statusText + (text ? " — " + text : ""));
            }
            if (!res.body) throw new Error("Response body is null");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";

            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const parts = buf.split("\\n\\n");
                buf = parts.pop()!;
                for (const part of parts) {
                    if (!part.trim()) continue;
                    for (const line of part.split("\\n")) {
                        if (!line.startsWith("data:")) continue;
                        const d = line.substring(5).trim();
                        if (d === "[DONE]") { this._end(); return; }
                        try { this._push({ v: JSON.parse(d) }); } catch { this._push({ v: d }); }
                    }
                }
            }
            if (buf.trim()) {
                for (const line of buf.split("\\n")) {
                    if (!line.startsWith("data:")) continue;
                    const d = line.substring(5).trim();
                    if (d !== "[DONE]") {
                        try { this._push({ v: JSON.parse(d) }); } catch { this._push({ v: d }); }
                    }
                }
            }
            this._end();
        } catch (err: any) {
            this._push({ e: err instanceof Error ? err : new Error(String(err)) });
            this._end();
        }
    }

    private _push(item: { v: any } | { e: Error }) {
        this._q.push(item);
        if (this._wake) { this._wake(); this._wake = null; }
    }

    private _end() {
        this._done = true;
        if (this._wake) { this._wake(); this._wake = null; }
    }

    /** Consume the stream via callbacks (DigitalOcean style). */
    async consume(cbs: InferenceStreamCallbacks): Promise<void> {
        try {
            for await (const chunk of this) { cbs.onData?.(chunk); }
            cbs.onComplete?.();
        } catch (err: any) {
            const e = err instanceof Error ? err : new Error(String(err));
            if (cbs.onError) cbs.onError(e);
            else throw e;
        }
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<any> {
        const self = this;
        return {
            async next(): Promise<IteratorResult<any>> {
                while (self._q.length === 0 && !self._done) {
                    await new Promise<void>((r) => { self._wake = r; });
                }
                if (self._q.length > 0) {
                    const item = self._q.shift()!;
                    if ("e" in item) throw item.e;
                    return { value: item.v, done: false };
                }
                return { value: undefined, done: true };
            },
            [Symbol.asyncIterator]() { return this; },
        };
    }
}

export class InferenceClient {
    private readonly _baseUrl: string;
    private readonly _apiKey: string;

    constructor(opts: InferenceClientOptions) {
        const key = opts?.apiKey?.trim();
        if (!key) throw new Error("apiKey is required");
        this._apiKey = key;
        this._baseUrl = normalizeInferenceBaseUrl(opts.baseURL ?? DEFAULT_INFERENCE_BASE_URL);
    }

    private async _fetch(path: string, method: string, body?: any): Promise<any> {
        const res = await fetch(this._baseUrl + path, {
            method,
            headers: { "Authorization": "Bearer " + this._apiKey, "Content-Type": "application/json" },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error("HTTP " + res.status + ": " + res.statusText + (text ? " — " + text : ""));
        }
        return res.json();
    }

    private _sse(path: string, body: any): SSEStream {
        return new SSEStream(this._baseUrl + path, this._apiKey, body);
    }

${methodsCode}${asyncAliasCode}}

export default InferenceClient;
`;

/* ───────── 5. write files ───────── */

fs.mkdirSync(outDir, { recursive: true });

const indexFile = path.join(outDir, "index.ts");
fs.writeFileSync(indexFile, indexBody, "utf8");
console.log(`postgen-inference: wrote ${path.relative(dotsRoot, indexFile)} (${paths.length} paths)`);

const clientFile = path.join(outDir, "InferenceClient.ts");
fs.writeFileSync(clientFile, clientBody, "utf8");
const methodSummary = endpoints.map(e => e.segments.join(".") + "." + e.methodName).join(", ");
console.log(`postgen-inference: wrote ${path.relative(dotsRoot, clientFile)} (${endpoints.length} methods: ${methodSummary})`);

/* ───────── 6. patch index.ts to re-export inference ───────── */

const INFERENCE_MARKER = "/* postgen-inference exports */";
const inferenceExports = `
${INFERENCE_MARKER}
export {
    createDigitalOceanInferenceClient,
    DEFAULT_INFERENCE_BASE_URL,
    INFERENCE_OPENAPI_PATHS,
} from "./src/inference-gen/index.js";
export {
    InferenceClient,
    SSEStream,
    type InferenceClientOptions,
    type InferenceStreamCallbacks,
} from "./src/inference-gen/InferenceClient.js";
export { default } from "./src/inference-gen/InferenceClient.js";
`;

const rootIndex = path.join(dotsRoot, "index.ts");
let rootSrc = fs.readFileSync(rootIndex, "utf8");
if (rootSrc.includes(INFERENCE_MARKER)) {
    rootSrc = rootSrc.replace(
        new RegExp("\n" + INFERENCE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*$"),
        inferenceExports,
    );
} else {
    rootSrc = rootSrc.trimEnd() + "\n" + inferenceExports;
}
fs.writeFileSync(rootIndex, rootSrc, "utf8");
console.log("postgen-inference: patched index.ts with inference exports");
