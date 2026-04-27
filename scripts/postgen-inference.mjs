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
    return seg.replace(/[-_]([a-zA-Z])/g, (_, c) => c.toUpperCase());
}

/**
 * Split an absolute path into:
 *   prefix — literal segments before any `{param}`        → used for property nesting
 *   params — `{param}` names in declaration order         → become positional method args
 *   suffix — literal segments after the LAST `{param}`    → action verb (e.g. "cancel", "results")
 *
 * Examples:
 *   /v1/batches                       → { prefix: ["batches"],            params: [],          suffix: [] }
 *   /v1/batches/files                 → { prefix: ["batches","files"],    params: [],          suffix: [] }
 *   /v1/batches/files/{file_id}       → { prefix: ["batches","files"],    params: ["file_id"], suffix: [] }
 *   /v1/batches/{batch_id}            → { prefix: ["batches"],            params: ["batch_id"],suffix: [] }
 *   /v1/batches/{batch_id}/cancel     → { prefix: ["batches"],            params: ["batch_id"],suffix: ["cancel"] }
 *   /v1/chat/completions              → { prefix: ["chat","completions"], params: [],          suffix: [] }
 */
function classifyPath(p) {
    const segs = p.replace(/^\/v1\//, "").split("/");
    const prefix = [];
    const params = [];
    const suffix = [];
    let seenParam = false;
    for (const s of segs) {
        const m = /^\{(.+)\}$/.exec(s);
        if (m) {
            params.push(m[1]);
            seenParam = true;
        } else if (seenParam) {
            suffix.push(s);
        } else {
            prefix.push(s);
        }
    }
    return { prefix, params, suffix };
}

/**
 * Derive an idiomatic method name from (HTTP verb, classification).
 * Mirrors the conventions used by OpenAI/Stripe-style SDKs.
 *
 *   suffix non-empty                → camelCased last suffix segment ("cancel", "results")
 *   suffix empty, params non-empty  → GET=retrieve · DELETE=del · PUT/PATCH=update · POST=create
 *   suffix empty, params empty      → GET=list     · POST=create  · PUT/PATCH=update · DELETE=del
 */
function deriveMethodName(httpMethod, params, suffix) {
    if (suffix.length > 0) {
        return segmentToCamel(suffix[suffix.length - 1]);
    }
    if (params.length > 0) {
        switch (httpMethod) {
            case "get":    return "retrieve";
            case "delete": return "del";
            case "put":
            case "patch":  return "update";
            case "post":   return "create";
        }
    }
    switch (httpMethod) {
        case "get":    return "list";
        case "post":   return "create";
        case "put":
        case "patch":  return "update";
        case "delete": return "del";
    }
    return "call";
}

/**
 * Build a string-concatenation expression that reproduces a path with its
 * `{param}` segments substituted via encodeURIComponent on a camelCased local
 * variable of the same name.
 *
 *   "/v1/batches"                       → '"/v1/batches"'
 *   "/v1/batches/{batch_id}"            → '"/v1/batches/" + encodeURIComponent(batchId)'
 *   "/v1/batches/{batch_id}/cancel"     → '"/v1/batches/" + encodeURIComponent(batchId) + "/cancel"'
 */
function pathTemplate(p) {
    const segs = p.split("/").slice(1); // drop leading "" (path is absolute)
    const tokens = [];
    let pending = "";
    for (const s of segs) {
        const m = /^\{(.+)\}$/.exec(s);
        if (m) {
            pending += "/";
            tokens.push({ kind: "lit", text: pending });
            pending = "";
            tokens.push({ kind: "param", name: segmentToCamel(m[1]) });
        } else {
            pending += "/" + s;
        }
    }
    if (pending) tokens.push({ kind: "lit", text: pending });
    if (tokens.length === 1 && tokens[0].kind === "lit") {
        return JSON.stringify(tokens[0].text);
    }
    return tokens
        .map(t => t.kind === "lit" ? JSON.stringify(t.text) : "encodeURIComponent(" + t.name + ")")
        .join(" + ");
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

// Collect every Serverless-Inference operation across all paths. A single
// path can declare multiple verbs (e.g. /v1/batches has both GET and POST),
// so we no longer break after the first verb.
const endpoints = [];

for (const p of paths) {
    const pathItem = doc.paths[p];
    const cls = classifyPath(p);
    const camelPrefix = cls.prefix.map(segmentToCamel);

    for (const httpMethod of ["get", "post", "put", "patch", "delete"]) {
        const op = pathItem?.[httpMethod];
        if (!isServerlessInferenceOp(op)) continue;

        const reqSchema = getRequestBodySchema(op);
        const resSchema = getResponseSchema(op);
        const supportsStreaming = reqSchema?.properties?.stream !== undefined;
        const hasOutputArray = resSchema?.properties?.output?.type === "array";
        const hasRequestBody = !!reqSchema;
        const methodName = deriveMethodName(httpMethod, cls.params, cls.suffix);

        endpoints.push({
            path: p,
            httpMethod,
            prefix: camelPrefix,            // property nesting on InferenceClient
            params: cls.params,             // path-param names (snake_case as in spec)
            suffix: cls.suffix,             // action segment(s), if any
            methodName,
            pathExpr: pathTemplate(p),      // emission-ready path expression
            hasRequestBody,
            supportsStreaming,
            hasOutputArray,                 // needs output_text aggregation
        });
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

// Build a tree from each endpoint's literal prefix → property nesting.
// Path-param segments do NOT become properties; they are method args.
//
// Multiple endpoints can share the same prefix (e.g. /v1/batches has GET=list,
// POST=create, plus its parameterised children retrieve/cancel/results — all
// rooted at prefix=["batches"]). Each endpoint's emitted method goes into the
// `__methods` array on the leaf node.
const tree = {};
for (const ep of endpoints) {
    let node = tree;
    for (let i = 0; i < ep.prefix.length; i++) {
        const seg = ep.prefix[i];
        if (!node[seg]) node[seg] = {};
        if (i === ep.prefix.length - 1) {
            (node[seg].__methods ??= []).push(ep);
        } else {
            if (!node[seg].__children) node[seg].__children = {};
            node = node[seg].__children;
        }
    }
}

/**
 * Emit a single method (the JS shape `name: async (...args) => { ... },`).
 * Generic over: 0..N path params, optional query string (GET), optional
 * JSON body (POST/PUT/PATCH), and optional streaming.
 */
function emitMethodBody(ep, indent) {
    const httpVerb = ep.httpMethod.toUpperCase();
    const pathExpr = ep.pathExpr;

    // Positional path-param signature: each param becomes `<camelName>: string`.
    const pathArgs = ep.params.map(n => `${segmentToCamel(n)}: string`);

    // ── GET: path args + optional query object ──
    if (ep.httpMethod === "get") {
        const args = [...pathArgs, "query?: Record<string, any>"];
        return (
            `${indent}${ep.methodName}: async (${args.join(", ")}): Promise<any> => {\n` +
            `${indent}    const _qs = query\n` +
            `${indent}        ? "?" + Object.entries(query)\n` +
            `${indent}            .filter(([, v]) => v !== undefined && v !== null && v !== "")\n` +
            `${indent}            .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v)))\n` +
            `${indent}            .join("&")\n` +
            `${indent}        : "";\n` +
            `${indent}    return this._fetch(${pathExpr} + _qs, "GET");\n` +
            `${indent}},\n`
        );
    }

    // ── DELETE: path args only (no body) ──
    if (ep.httpMethod === "delete") {
        const args = pathArgs;
        return (
            `${indent}${ep.methodName}: async (${args.join(", ")}): Promise<any> => {\n` +
            `${indent}    return this._fetch(${pathExpr}, "DELETE");\n` +
            `${indent}},\n`
        );
    }

    // ── POST/PUT/PATCH ──
    // Streaming variant: supportsStreaming AND no path params (streaming is a
    // body-driven feature on root-shaped paths like /v1/chat/completions).
    if (ep.supportsStreaming && ep.params.length === 0) {
        const aggregateOutputText = ep.hasOutputArray;
        const args = ["params: Record<string, any>", "streamCallbacks?: InferenceStreamCallbacks"];
        let body =
            `${indent}    if (params.stream === true) {\n` +
            `${indent}        const s = this._sse(${pathExpr}, params);\n` +
            `${indent}        if (streamCallbacks?.onData) { await s.consume(streamCallbacks); return; }\n` +
            `${indent}        return s;\n` +
            `${indent}    }\n`;
        if (aggregateOutputText) {
            body +=
                `${indent}    const res = await this._fetch(${pathExpr}, "${httpVerb}", params);\n` +
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
                `${indent}    return res;\n`;
        } else {
            body += `${indent}    return this._fetch(${pathExpr}, "${httpVerb}", params);\n`;
        }
        return (
            `${indent}${ep.methodName}: async (\n` +
            `${indent}    ${args.join(",\n" + indent + "    ")},\n` +
            `${indent}): Promise<any> => {\n` +
            body +
            `${indent}},\n`
        );
    }

    // Body-required vs body-optional. Path-param-bearing actions (e.g. cancel)
    // typically have no body; root POSTs (e.g. create) require one.
    const bodyArg = ep.hasRequestBody
        ? "params: Record<string, any>"
        : "params?: Record<string, any>";
    const args = [...pathArgs, bodyArg];
    const bodyExpr = ep.hasRequestBody ? "params" : "params ?? undefined";

    return (
        `${indent}${ep.methodName}: async (${args.join(", ")}): Promise<any> => {\n` +
        `${indent}    return this._fetch(${pathExpr}, "${httpVerb}", ${bodyExpr});\n` +
        `${indent}},\n`
    );
}

/**
 * Recursively emit the property tree. Each tree node may carry:
 *   __methods  — endpoints whose prefix terminates at this node
 *   __children — sub-groups under this node
 */
function emitNode(obj, depth) {
    let out = "";
    const baseIndent = "    ".repeat(depth + 1);
    for (const [key, node] of Object.entries(obj)) {
        if (key.startsWith("__")) continue;
        const methods = node.__methods ?? [];
        const children = node.__children;
        const hasChildren = children && Object.keys(children).length > 0;

        if (depth === 0) {
            out += `    public readonly ${key} = {\n`;
        } else {
            out += `${baseIndent}${key}: {\n`;
        }

        for (const ep of methods) {
            out += emitMethodBody(ep, baseIndent + "    ");
        }
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

// /v1/batches/files (POST) and /v1/batches/{batch_id}/results (GET) cover the
// upload-intent and download-envelope steps, but OpenAI consumers reach for
// `client.files.create(...)` and `client.files.content(...)`. The DO server
// has no top-level /v1/files namespace, so we expose a thin alias group that
// forwards to the batch-scoped endpoints — keeping backward compatibility
// with the existing client.batches.files.create / client.batches.results.
const hasBatchFilesCreate = paths.includes("/v1/batches/files");
const hasBatchResults = paths.some(p => /^\/v1\/batches\/\{[^}]+\}\/results$/.test(p));
let filesAliasCode = "";
if (hasBatchFilesCreate || hasBatchResults) {
    const aliasParts = [];
    if (hasBatchFilesCreate) {
        aliasParts.push(`        /**
         * OpenAI-compat alias for \`client.batches.files.create({ file_name })\`.
         * DO returns \`{ file_id, upload_url }\`; \`PUT\` the JSONL bytes to
         * \`upload_url\` before calling \`client.batches.create(...)\`.
         */
        create: async (params: { file_name: string; [k: string]: any }): Promise<any> => {
            return this.batches.files.create(params);
        },`);
    }
    if (hasBatchResults) {
        aliasParts.push(`        /**
         * OpenAI-compat alias for \`client.batches.results(batchId)\`. Resolves
         * the result envelope, follows the presigned download URL, and returns
         * the raw \`fetch\` Response — matching OpenAI's
         * \`client.files.content(fileId)\` shape (call \`.text()\` / \`.body\` /
         * \`.json()\` on it).
         */
        content: async (batchId: string): Promise<Response> => {
            const result = await this.batches.results(batchId);
            const url =
                result?.download?.presigned_url
                ?? result?.output_file_url
                ?? result?.output_url;
            if (!url) {
                throw new Error(
                    "No download URL available (result_available=" +
                    String(result?.result_available) + ")",
                );
            }
            const res = await fetch(url);
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error("Download failed: HTTP " + res.status + ": " + res.statusText + (text ? " — " + text : ""));
            }
            return res;
        },`);
    }
    filesAliasCode = `
    /**
     * OpenAI-compat surface. Each method forwards to its
     * \`client.batches.*\` counterpart — both surfaces remain available.
     */
    public readonly files = {
${aliasParts.join("\n")}
    };
`;
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

${methodsCode}${filesAliasCode}${asyncAliasCode}}

export default InferenceClient;
`;

/* ───────── 5. write files ───────── */

fs.mkdirSync(outDir, { recursive: true });

const indexFile = path.join(outDir, "index.ts");
fs.writeFileSync(indexFile, indexBody, "utf8");
console.log(`postgen-inference: wrote ${path.relative(dotsRoot, indexFile)} (${paths.length} paths)`);

const clientFile = path.join(outDir, "InferenceClient.ts");
fs.writeFileSync(clientFile, clientBody, "utf8");
const methodSummary = endpoints.map(e => e.prefix.join(".") + "." + e.methodName).join(", ");
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
