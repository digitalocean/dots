import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";

import { DigitalOceanApiKeyAuthenticationProvider } from "../dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { createDigitalOceanClient } from "../dots/digitalOceanClient.js";
import type {
    Toolbelt,
    Toolbelt_create,
} from "../dots/models/index.js";
import type { ToolbeltsRequestBuilder } from "../dots/v2/toolbelts/index.js";
import {
    InferenceClient,
    type InferenceClientOptions,
} from "../inference-gen/InferenceClient.js";

export const DEFAULT_API_BASE_URL = "https://api.digitalocean.com";
export const DEFAULT_GATEWAY_BASE_URL = "https://actions.do-ai.run";
export const SESSION_ID_HEADER = "X-Session-Id";
export const ACTOR_ID_HEADER = "X-Actor-Id";

export const META_SEARCH = "action_search";
export const META_INVOKE = "action_invoke";
export const META_CODE = "action_code";

type JsonObject = Record<string, unknown>;

export interface PermissionRule {
    tool: string;
    action?: "allow" | "ask" | "deny" | string;
    match?: JsonObject;
}

export interface Permissions {
    defaultAction?: "allow" | "ask" | "deny" | string;
    default_action?: "allow" | "ask" | "deny" | string;
    rules?: PermissionRule[];
}

export interface CreateSessionOptions {
    actorId: string;
    name?: string;
    permissions?: Permissions;
}

export interface CreateToolbeltOptions {
    name: string;
    tools: string[];
    version?: string;
    displayName?: string;
    description?: string;
}

export type ToolbeltWithRef = Toolbelt & { readonly ref: string };

export interface ActionGatewayClientOptions extends InferenceClientOptions {
    apiBaseURL?: string;
    gatewayBaseURL?: string;
    provider?: GatewayProvider;
}

export interface ToolDefinition {
    name: string;
    title?: string;
    description?: string;
    inputSchema?: JsonObject;
    [key: string]: unknown;
}

export interface ToolCall {
    callId: string;
    name: string;
    arguments: JsonObject;
}

export interface SessionToolsOptions {
    includeAll?: boolean;
    names?: string[];
    search?: string | SearchQuery | Array<string | SearchQuery>;
    providers?: string[];
    tags?: string[];
    limit?: number;
}

export interface SearchQuery {
    use_case: string;
    known_fields?: string;
}

export interface SearchOptions {
    providers?: string[];
    tags?: string[];
    limit?: number;
}

export interface InvokeTool {
    tool?: string;
    toolSlug?: string;
    arguments?: JsonObject;
}

export interface InvokeOptions {
    rationale?: string;
}

export type ToolResultMessage = JsonObject;

export interface GatewayProvider {
    readonly name: string;
    wrapTools(tools: ToolDefinition[]): JsonObject[];
    extractToolCalls(response: unknown): ToolCall[];
    formatToolResults(calls: ToolCall[], results: unknown[]): ToolResultMessage[];
}

export class GatewayError extends Error {
    public constructor(
        message: string,
        public readonly status?: number,
        public readonly body?: unknown,
    ) {
        super(message);
        this.name = "GatewayError";
    }
}

function asObject(value: unknown): JsonObject {
    return value !== null && typeof value === "object" ? value as JsonObject : {};
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function parseArguments(value: unknown): JsonObject {
    if (typeof value === "string") {
        if (!value.trim()) return {};
        return asObject(JSON.parse(value));
    }
    return asObject(value);
}

function stringifyResult(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}

function simplifySchema(schema: unknown): JsonObject {
    const simplified = structuredClone(asObject(schema));
    for (const key of ["oneOf", "allOf", "anyOf", "enum", "const", "not"]) {
        delete simplified[key];
    }
    simplified.type ??= "object";
    if (simplified.type === "object") simplified.properties ??= {};
    return simplified;
}

function toolFields(tool: ToolDefinition): JsonObject {
    return {
        name: tool.name,
        description: tool.description ?? tool.title ?? "",
        parameters: simplifySchema(tool.inputSchema),
    };
}

export class ChatCompletionsProvider implements GatewayProvider {
    public readonly name = "chat.completions";

    public wrapTools(tools: ToolDefinition[]): JsonObject[] {
        return tools.map((tool) => ({ type: "function", function: toolFields(tool) }));
    }

    public extractToolCalls(response: unknown): ToolCall[] {
        const choice = asObject(asArray(asObject(response).choices)[0]);
        const message = asObject(choice.message);
        return asArray(message.tool_calls).map((value) => {
            const call = asObject(value);
            const functionCall = asObject(call.function);
            return {
                callId: String(call.id ?? ""),
                name: String(functionCall.name ?? ""),
                arguments: parseArguments(functionCall.arguments),
            };
        });
    }

    public formatToolResults(calls: ToolCall[], results: unknown[]): ToolResultMessage[] {
        return calls.map((call, index) => ({
            role: "tool",
            tool_call_id: call.callId,
            content: stringifyResult(results[index]),
        }));
    }
}

export class MessagesProvider implements GatewayProvider {
    public readonly name = "messages";

    public wrapTools(tools: ToolDefinition[]): JsonObject[] {
        return tools.map((tool) => {
            const fields = toolFields(tool);
            return {
                name: fields.name,
                description: fields.description,
                input_schema: fields.parameters,
            };
        });
    }

    public extractToolCalls(response: unknown): ToolCall[] {
        return asArray(asObject(response).content)
            .map(asObject)
            .filter((block) => block.type === "tool_use")
            .map((block) => ({
                callId: String(block.id ?? ""),
                name: String(block.name ?? ""),
                arguments: parseArguments(block.input),
            }));
    }

    public formatToolResults(calls: ToolCall[], results: unknown[]): ToolResultMessage[] {
        if (calls.length === 0) return [];
        return [{
            role: "user",
            content: calls.map((call, index) => ({
                type: "tool_result",
                tool_use_id: call.callId,
                content: stringifyResult(results[index]),
            })),
        }];
    }
}

export class ResponsesProvider implements GatewayProvider {
    public readonly name = "responses";

    public wrapTools(tools: ToolDefinition[]): JsonObject[] {
        return tools.map((tool) => ({ type: "function", ...toolFields(tool) }));
    }

    public extractToolCalls(response: unknown): ToolCall[] {
        return asArray(asObject(response).output)
            .map(asObject)
            .filter((item) => item.type === "function_call")
            .map((item) => ({
                callId: String(item.call_id ?? item.id ?? ""),
                name: String(item.name ?? ""),
                arguments: parseArguments(item.arguments),
            }));
    }

    public formatToolResults(calls: ToolCall[], results: unknown[]): ToolResultMessage[] {
        return calls.map((call, index) => ({
            type: "function_call_output",
            call_id: call.callId,
            output: stringifyResult(results[index]),
        }));
    }
}

function normalizeBaseURL(value: string): string {
    const url = value.trim().replace(/\/+$/, "");
    return url.includes("://") ? url : `https://${url}`;
}

function externalSessionId(sessionUrn: string): string {
    return sessionUrn.split(":").at(-1) ?? sessionUrn;
}

function normalizePermissions(permissions?: Permissions): Required<Pick<Permissions, "defaultAction" | "rules">> {
    const rules = (permissions?.rules ?? []).map((rule) => {
        if (!rule.tool) throw new Error("each permissions rule requires tool");
        return {
            tool: rule.tool,
            action: rule.action ?? "allow",
            ...(rule.match ? { match: rule.match } : {}),
        };
    });
    return {
        defaultAction: permissions?.defaultAction ?? permissions?.default_action ?? "allow",
        rules,
    };
}

async function requestJSON(
    url: string,
    apiKey: string,
    init: RequestInit,
): Promise<unknown> {
    const response = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            ...init.headers,
        },
    });
    const text = await response.text();
    let body: unknown;
    try {
        body = text ? JSON.parse(text) : undefined;
    } catch {
        body = text;
    }
    if (!response.ok) {
        const message = String(asObject(body).message ?? response.statusText ?? "request failed");
        throw new GatewayError(message, response.status, body);
    }
    return body;
}

const META_TOOLS: ToolDefinition[] = [
    {
        name: META_SEARCH,
        title: "Action Search",
        description: "Discover catalog tools for one or more use cases.",
        inputSchema: {
            type: "object",
            properties: {
                queries: {
                    type: "array",
                    minItems: 1,
                    maxItems: 5,
                    items: {
                        type: "object",
                        properties: {
                            use_case: { type: "string" },
                            known_fields: { type: "string" },
                        },
                        required: ["use_case"],
                    },
                },
                providers: { type: "array", items: { type: "string" } },
                tags: { type: "array", items: { type: "string" } },
                limit: { type: "integer" },
            },
            required: ["queries"],
        },
    },
    {
        name: META_INVOKE,
        title: "Action Invoke",
        description: "Invoke one to ten catalog tools in parallel.",
        inputSchema: {
            type: "object",
            properties: {
                tools: {
                    type: "array",
                    minItems: 1,
                    maxItems: 10,
                    items: {
                        type: "object",
                        properties: {
                            tool: { type: "string" },
                            tool_slug: { type: "string" },
                            arguments: { type: "object" },
                        },
                    },
                },
                rationale: { type: "string", maxLength: 512 },
            },
            required: ["tools"],
        },
    },
    {
        name: META_CODE,
        title: "Action Code",
        description: "Run Python in an ephemeral sandbox.",
        inputSchema: {
            type: "object",
            properties: {
                code: { type: "string" },
                code_to_execute: { type: "string" },
                thought: { type: "string" },
            },
        },
    },
];

class GatewayTransport {
    public readonly sessionId: string;

    public constructor(
        private readonly apiKey: string,
        private readonly gatewayBaseURL: string,
        sessionUrn: string,
        private readonly actorId: string,
    ) {
        this.sessionId = externalSessionId(sessionUrn);
    }

    public async request(path: string, method = "GET", body?: JsonObject): Promise<unknown> {
        return requestJSON(`${this.gatewayBaseURL}${path}`, this.apiKey, {
            method,
            headers: {
                [SESSION_ID_HEADER]: this.sessionId,
                [ACTOR_ID_HEADER]: this.actorId,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }
}

function unwrapToolResult(payload: unknown): unknown {
    const result = asObject(payload);
    if (result.status && result.status !== "succeeded") {
        const error = asObject(result.error);
        throw new GatewayError(String(error.message ?? "tool call failed"), undefined, payload);
    }
    if ("output" in result) {
        if (typeof result.output === "string") {
            try {
                return JSON.parse(result.output);
            } catch {
                return result.output;
            }
        }
        return result.output;
    }
    return payload;
}

function normalizeQueries(input: string | SearchQuery | Array<string | SearchQuery>): SearchQuery[] {
    const queries = Array.isArray(input) ? input : [input];
    if (queries.length < 1 || queries.length > 5) {
        throw new Error("search accepts between 1 and 5 queries");
    }
    return queries.map((query) => typeof query === "string" ? { use_case: query } : query);
}

export class ToolsOperations {
    public constructor(
        private readonly transport: GatewayTransport,
        private readonly provider: GatewayProvider,
    ) {}

    public async list(options: { includeAll?: boolean } = {}): Promise<ToolDefinition[]> {
        if (!options.includeAll) return structuredClone(META_TOOLS);
        const body = asObject(await this.transport.request("/tools"));
        return (Array.isArray(body.tools) ? body.tools : asArray(body)) as ToolDefinition[];
    }

    public async search(
        queries: string | SearchQuery | Array<string | SearchQuery>,
        options: SearchOptions = {},
    ): Promise<unknown> {
        return unwrapToolResult(await this.transport.request("/tools/search", "POST", {
            queries: normalizeQueries(queries),
            ...(options.providers?.length ? { providers: options.providers } : {}),
            ...(options.tags?.length ? { tags: options.tags } : {}),
            ...(options.limit !== undefined ? { limit: options.limit } : {}),
        }));
    }

    public async invoke(tools: InvokeTool[], options: InvokeOptions = {}): Promise<unknown> {
        if (tools.length < 1 || tools.length > 10) {
            throw new Error("invoke accepts between 1 and 10 tools");
        }
        const normalized = tools.map((tool) => {
            const name = tool.tool ?? tool.toolSlug;
            if (!name) throw new Error("each invoke entry requires tool");
            return { tool: name, arguments: tool.arguments ?? {} };
        });
        return this.transport.request("/tools/invoke", "POST", {
            tools: normalized,
            ...(options.rationale ? { rationale: options.rationale } : {}),
        });
    }

    public async invokeOne(name: string, arguments_: JsonObject = {}, options: InvokeOptions = {}): Promise<unknown> {
        const envelope = asObject(await this.invoke([{ tool: name, arguments: arguments_ }], options));
        const first = asObject(asArray(envelope.results)[0]);
        if (Object.keys(first).length === 0) throw new GatewayError(`invoke of ${name} returned no results`);
        return unwrapToolResult(first.result ?? first);
    }

    public async definitions(options: SessionToolsOptions = {}): Promise<JsonObject[]> {
        let catalog: ToolDefinition[];
        if (options.search !== undefined) {
            catalog = flattenSearchResults(await this.search(options.search, options));
        } else {
            catalog = await this.list({ includeAll: options.includeAll || Boolean(options.names?.length) });
        }
        if (options.names?.length) {
            const names = new Set(options.names);
            catalog = catalog.filter((tool) => names.has(tool.name));
            const missing = options.names.filter((name) => !catalog.some((tool) => tool.name === name));
            if (missing.length) throw new Error(`tools not found in catalog: ${missing.join(", ")}`);
        }
        return this.provider.wrapTools(catalog);
    }
}

function flattenSearchResults(payload: unknown): ToolDefinition[] {
    const found = new Map<string, ToolDefinition>();
    for (const group of asArray(asObject(payload).results)) {
        for (const match of asArray(asObject(group).results)) {
            const tool = asObject(match) as ToolDefinition;
            if (tool.name && !found.has(tool.name)) found.set(tool.name, tool);
        }
    }
    return [...found.values()];
}

export class CodeOperations {
    public constructor(private readonly transport: GatewayTransport) {}

    public async execute(code: string, options: { thought?: string } = {}): Promise<unknown> {
        if (!code.trim()) throw new Error("code is empty");
        return unwrapToolResult(await this.transport.request("/code/execute", "POST", {
            code,
            ...(options.thought ? { thought: options.thought } : {}),
        }));
    }
}

export class Session {
    public readonly id: string;
    public readonly toolsOperations: ToolsOperations;
    public readonly code: CodeOperations;

    public constructor(
        public readonly sessionUrn: string,
        public readonly actorId: string,
        public readonly name: string,
        public readonly policy: Required<Pick<Permissions, "defaultAction" | "rules">>,
        private readonly gatewayBaseURL: string,
        private readonly provider: GatewayProvider,
        transport: GatewayTransport,
        public readonly raw: JsonObject,
    ) {
        this.id = externalSessionId(sessionUrn);
        this.toolsOperations = new ToolsOperations(transport, provider);
        this.code = new CodeOperations(transport);
    }

    public get url(): string {
        return `${this.gatewayBaseURL}/mcp/session/${this.id}`;
    }

    public tools(options: SessionToolsOptions = {}): Promise<JsonObject[]> {
        return this.toolsOperations.definitions(options);
    }

    public async handleToolCalls(response: unknown, options: InvokeOptions = {}): Promise<ToolResultMessage[]> {
        const calls = this.provider.extractToolCalls(response);
        const results = await this.executeToolCalls(calls, options);
        return this.provider.formatToolResults(calls, results);
    }

    public async executeToolCalls(calls: ToolCall[], options: InvokeOptions = {}): Promise<unknown[]> {
        return Promise.all(calls.map(async (call) => {
            if (call.name === META_SEARCH) return this.toolsOperations.search(asArray(call.arguments.queries) as SearchQuery[], call.arguments as SearchOptions);
            if (call.name === META_INVOKE) return this.toolsOperations.invoke(asArray(call.arguments.tools) as InvokeTool[], {
                rationale: String(call.arguments.rationale ?? options.rationale ?? "") || undefined,
            });
            if (call.name === META_CODE) {
                const code = String(call.arguments.code ?? call.arguments.code_to_execute ?? "");
                return this.code.execute(code, { thought: String(call.arguments.thought ?? "") || undefined });
            }
            return this.toolsOperations.invokeOne(call.name, call.arguments, options);
        }));
    }
}

export class SessionsOperations {
    public constructor(
        private readonly apiKey: string,
        private readonly apiBaseURL: string,
        private readonly gatewayBaseURL: string,
        private readonly provider: GatewayProvider,
    ) {}

    public async create(options: CreateSessionOptions): Promise<Session> {
        const actorId = options.actorId?.trim();
        if (!actorId) throw new Error("actorId is required");
        const suffix = Math.random().toString(16).slice(2, 10);
        const name = options.name ?? `dots-session-${suffix}`;
        const policy = normalizePermissions(options.permissions);
        const payload = asObject(await requestJSON(
            `${this.apiBaseURL}/v2/action-gateway/sessions`,
            this.apiKey,
            {
                method: "POST",
                body: JSON.stringify({
                    actor_id: actorId,
                    name,
                    policy_json: JSON.stringify(policy),
                }),
            },
        ));
        const raw = asObject(payload.session);
        const sessionUrn = String(raw.sessionUrn ?? raw.session_urn ?? "");
        if (!sessionUrn) throw new GatewayError("session create response is missing sessionUrn", undefined, payload);
        const transport = new GatewayTransport(this.apiKey, this.gatewayBaseURL, sessionUrn, actorId);
        return new Session(
            sessionUrn,
            actorId,
            String(raw.name ?? name),
            policy,
            this.gatewayBaseURL,
            this.provider,
            transport,
            raw,
        );
    }
}

export class ActionGatewayClient extends InferenceClient {
    public readonly session: SessionsOperations;
    public readonly sessions: SessionsOperations;
    public readonly toolbelts: ToolbeltsRequestBuilder;
    public readonly provider: GatewayProvider;

    public constructor(options: ActionGatewayClientOptions) {
        super(options);
        const apiKey = options.apiKey?.trim();
        if (!apiKey) throw new Error("apiKey is required");
        const apiBaseURL = normalizeBaseURL(options.apiBaseURL ?? DEFAULT_API_BASE_URL);
        const gatewayBaseURL = normalizeBaseURL(options.gatewayBaseURL ?? DEFAULT_GATEWAY_BASE_URL);
        this.provider = options.provider ?? new ChatCompletionsProvider();
        this.session = new SessionsOperations(apiKey, apiBaseURL, gatewayBaseURL, this.provider);
        this.sessions = this.session;

        const authProvider = new DigitalOceanApiKeyAuthenticationProvider(apiKey);
        const adapter = new FetchRequestAdapter(authProvider);
        adapter.baseUrl = apiBaseURL;
        this.toolbelts = createDigitalOceanClient(adapter).v2.toolbelts;
    }

    public async createToolbelt(options: CreateToolbeltOptions): Promise<ToolbeltWithRef> {
        if (!Array.isArray(options.tools)) throw new TypeError("tools must be an array of tool names");
        const body: Toolbelt_create = {
            name: options.name,
            tools: options.tools,
            version: options.version,
            displayName: options.displayName,
            description: options.description,
        };
        const response = await this.toolbelts.post(body);
        const toolbelt = response?.toolbelt;
        if (!toolbelt?.reference) throw new GatewayError("toolbelt create response is missing reference");
        return Object.defineProperty(toolbelt, "ref", {
            configurable: true,
            enumerable: true,
            get: () => toolbelt.reference,
        }) as ToolbeltWithRef;
    }
}

export { ActionGatewayClient as Client };
export default ActionGatewayClient;
