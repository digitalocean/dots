import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";

import { DigitalOceanApiKeyAuthenticationProvider } from "../dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { createDigitalOceanClient } from "../dots/digitalOceanClient.js";
import type {
    Create_session_request,
    Create_session_request_config,
    Session_policy_rule,
    Session_policy_spec,
    Toolbelt,
    Toolbelt_create,
} from "../dots/models/index.js";
import type { ConnectionsRequestBuilder } from "../dots/v2/connections/index.js";
import type { SessionsRequestBuilder } from "../dots/v2/sessions/index.js";
import type { ToolbeltsRequestBuilder } from "../dots/v2/toolbelts/index.js";
import type { ToolsRequestBuilder } from "../dots/v2/tools/index.js";
import type { UsersRequestBuilder } from "../dots/v2/users/index.js";
import {
    InferenceClient,
    type InferenceClientOptions,
} from "../inference-gen/InferenceClient.js";

export const DEFAULT_API_BASE_URL = "https://api.digitalocean.com";
export const SESSION_ID_HEADER = "X-Session-Id";
export const ACTOR_ID_HEADER = "X-Actor-Id";
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const META_SEARCH = "action_search";
export const META_INVOKE = "action_invoke";
export const META_CODE = "action_code";

type JsonObject = Record<string, unknown>;

export interface PermissionRule {
    tool: string;
    action?: "allow" | "ask" | "deny" | string;
    match?: Record<string, string>;
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
    tools?: string[];
    config?: JsonObject;
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
        defaultAction: permissions?.defaultAction ?? permissions?.default_action ?? "ask",
        rules,
    };
}

function toSessionPolicy(policy: Required<Pick<Permissions, "defaultAction" | "rules">>): Session_policy_spec {
    return {
        defaultAction: policy.defaultAction as Session_policy_spec["defaultAction"],
        rules: policy.rules.map((rule): Session_policy_rule => ({
            tool: rule.tool,
            action: rule.action as Session_policy_rule["action"],
            ...(rule.match ? { match: { additionalData: rule.match } } : {}),
        })),
    };
}

function toSessionConfig(config: JsonObject): Create_session_request_config {
    const { preloadTools, ...additionalData } = config;
    return {
        ...(preloadTools === undefined ? {} : { preloadTools: preloadTools as string[] }),
        ...(Object.keys(additionalData).length === 0 ? {} : { additionalData }),
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
    private nextRequestId = 1;

    public constructor(
        private readonly apiKey: string,
        private readonly endpointURL: string,
        sessionUrn: string,
        private readonly actorId: string,
    ) {
        this.sessionId = externalSessionId(sessionUrn);
    }

    public async callTool(name: string, arguments_: JsonObject): Promise<unknown> {
        const result = await this.rpc("tools/call", { name, arguments: arguments_ });
        return unwrapMCPToolResult(result);
    }

    public async listTools(): Promise<ToolDefinition[]> {
        const result = asObject(await this.rpc("tools/list"));
        return asArray(result.tools) as ToolDefinition[];
    }

    public async decideApproval(approvalId: string, decision: "approve" | "deny"): Promise<unknown> {
        const normalizedApprovalId = approvalId.trim();
        if (!normalizedApprovalId) throw new Error("approvalId is required");
        const origin = new URL(this.endpointURL).origin;
        return requestJSON(`${origin}/approvals/${encodeURIComponent(normalizedApprovalId)}`, this.apiKey, {
            method: "POST",
            headers: {
                [SESSION_ID_HEADER]: this.sessionId,
                [ACTOR_ID_HEADER]: this.actorId,
            },
            body: JSON.stringify({ decision }),
        });
    }

    private async rpc(method: string, params?: JsonObject): Promise<unknown> {
        const response = await fetch(this.endpointURL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                Accept: "application/json, text/event-stream",
                "Content-Type": "application/json",
                "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
                [SESSION_ID_HEADER]: this.sessionId,
                [ACTOR_ID_HEADER]: this.actorId,
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: this.nextRequestId++,
                method,
                ...(params === undefined ? {} : { params }),
            }),
        });
        const text = await response.text();
        const envelope = parseMCPEnvelope(text);
        if (!response.ok) {
            throw new GatewayError(
                String(asObject(envelope).message ?? response.statusText ?? "request failed"),
                response.status,
                envelope,
            );
        }
        const error = asObject(asObject(envelope).error);
        if (Object.keys(error).length > 0) {
            throw new GatewayError(String(error.message ?? "MCP request failed"), undefined, error);
        }
        if (!("result" in asObject(envelope))) {
            throw new GatewayError("MCP response is missing result", undefined, envelope);
        }
        return asObject(envelope).result;
    }
}

function parseMCPEnvelope(text: string): unknown {
    if (!text.trim()) return undefined;
    if (!text.split("\n").some((line) => line.startsWith("data:"))) return JSON.parse(text);
    const events = text.split(/\r?\n\r?\n/);
    for (const event of events) {
        const data = event.split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
        if (!data) continue;
        const candidate = JSON.parse(data);
        if ("result" in asObject(candidate) || "error" in asObject(candidate)) return candidate;
    }
    throw new GatewayError("MCP response did not contain a JSON-RPC result");
}

function unwrapMCPToolResult(payload: unknown): unknown {
    const result = asObject(payload);
    if (result.isError) {
        const structured = asObject(result.structuredContent);
        const error = asObject(structured.error);
        throw new GatewayError(String(error.message ?? contentText(result.content) ?? "tool call failed"), undefined, payload);
    }
    if ("structuredContent" in result) return result.structuredContent;
    const text = contentText(result.content);
    if (text === undefined) return payload;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function contentText(content: unknown): string | undefined {
    const text = asArray(content)
        .map(asObject)
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => String(item.text))
        .join("\n");
    return text || undefined;
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

function toolErrorResult(error: GatewayError): JsonObject {
    const body = asObject(error.body);
    const structured = asObject(body.structuredContent);
    const structuredError = asObject(structured.error);
    const bodyError = asObject(body.error);
    const details = Object.keys(structuredError).length > 0 ? structuredError : bodyError;
    return {
        error: Object.keys(details).length > 0
            ? { ...details, message: details.message ?? error.message }
            : { message: error.message },
        ...(body._meta === undefined ? {} : { _meta: body._meta }),
    };
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
        return this.transport.listTools();
    }

    public async search(
        queries: string | SearchQuery | Array<string | SearchQuery>,
        options: SearchOptions = {},
    ): Promise<unknown> {
        return this.transport.callTool(META_SEARCH, {
            queries: normalizeQueries(queries),
            ...(options.providers?.length ? { providers: options.providers } : {}),
            ...(options.tags?.length ? { tags: options.tags } : {}),
            ...(options.limit !== undefined ? { limit: options.limit } : {}),
        });
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
        return this.transport.callTool(META_INVOKE, {
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
        return this.transport.callTool(META_CODE, {
            code,
            ...(options.thought ? { thought: options.thought } : {}),
        });
    }
}

export class Session {
    public readonly id: string;
    public readonly toolsOperations: ToolsOperations;
    public readonly code: CodeOperations;
    private readonly transport: GatewayTransport;

    public constructor(
        public readonly sessionUrn: string,
        public readonly actorId: string,
        public readonly name: string,
        public readonly policy: Required<Pick<Permissions, "defaultAction" | "rules">>,
        private readonly mcpURL: string,
        private readonly provider: GatewayProvider,
        transport: GatewayTransport,
        public readonly raw: JsonObject,
        public readonly selectedTools: string[],
    ) {
        this.id = externalSessionId(sessionUrn);
        this.transport = transport;
        this.toolsOperations = new ToolsOperations(transport, provider);
        this.code = new CodeOperations(transport);
    }

    public get url(): string {
        return this.mcpURL;
    }

    public approve(approvalId: string): Promise<unknown> {
        return this.transport.decideApproval(approvalId, "approve");
    }

    public deny(approvalId: string): Promise<unknown> {
        return this.transport.decideApproval(approvalId, "deny");
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
            try {
                if (call.name === META_SEARCH) return await this.toolsOperations.search(asArray(call.arguments.queries) as SearchQuery[], call.arguments as SearchOptions);
                if (call.name === META_INVOKE) return await this.toolsOperations.invoke(asArray(call.arguments.tools) as InvokeTool[], {
                    rationale: String(call.arguments.rationale ?? options.rationale ?? "") || undefined,
                });
                if (call.name === META_CODE) {
                    const code = String(call.arguments.code ?? call.arguments.code_to_execute ?? "");
                    return await this.code.execute(code, { thought: String(call.arguments.thought ?? "") || undefined });
                }
                return await this.toolsOperations.invokeOne(call.name, call.arguments, options);
            } catch (error) {
                if (error instanceof GatewayError) return toolErrorResult(error);
                throw error;
            }
        }));
    }
}

export class SessionsOperations {
    public constructor(
        private readonly apiKey: string,
        private readonly provider: GatewayProvider,
        private readonly sessionsApi: SessionsRequestBuilder,
    ) {}

    public async create(options: CreateSessionOptions): Promise<Session> {
        const actorId = options.actorId?.trim();
        if (!actorId) throw new Error("actorId is required");
        const suffix = Math.random().toString(16).slice(2, 10);
        const name = options.name ?? `dots-session-${suffix}`;
        const policy = normalizePermissions(options.permissions);
        if (options.tools !== undefined && !Array.isArray(options.tools)) {
            throw new TypeError("tools must be an array of tool references");
        }
        const body: Create_session_request = {
            actorId,
            name,
            policy: toSessionPolicy(policy),
            ...(options.tools === undefined ? {} : { tools: options.tools }),
            ...(options.config === undefined ? {} : { config: toSessionConfig(options.config) }),
        };
        const payload = await this.sessionsApi.post(body);
        const raw = asObject(payload?.session);
        const sessionUrn = String(payload?.session?.sessionUrn ?? "");
        if (!sessionUrn) throw new GatewayError("session create response is missing sessionUrn", undefined, payload);
        const mcpURL = String(payload?.mcpUrl ?? "");
        if (!mcpURL) throw new GatewayError("session create response is missing mcpUrl", undefined, payload);
        const selectedTools = (payload?.tools ?? []).map(String);
        const transport = new GatewayTransport(this.apiKey, mcpURL, sessionUrn, actorId);
        return new Session(
            sessionUrn,
            actorId,
            String(raw.name ?? name),
            policy,
            mcpURL,
            this.provider,
            transport,
            raw,
            selectedTools,
        );
    }
}

export class ActionGatewayClient extends InferenceClient {
    public readonly session: SessionsOperations;
    public readonly sessions: SessionsOperations;
    public readonly sessionsApi: SessionsRequestBuilder;
    public readonly tools: ToolsRequestBuilder;
    public readonly toolbelts: ToolbeltsRequestBuilder;
    public readonly connections: ConnectionsRequestBuilder;
    public readonly users: UsersRequestBuilder;
    public readonly provider: GatewayProvider;

    public constructor(options: ActionGatewayClientOptions) {
        super(options);
        const apiKey = options.apiKey?.trim();
        if (!apiKey) throw new Error("apiKey is required");
        const apiBaseURL = normalizeBaseURL(options.apiBaseURL ?? DEFAULT_API_BASE_URL);
        this.provider = options.provider ?? new ChatCompletionsProvider();

        const authProvider = new DigitalOceanApiKeyAuthenticationProvider(apiKey);
        const adapter = new FetchRequestAdapter(authProvider);
        adapter.baseUrl = apiBaseURL;
        const publicApi = createDigitalOceanClient(adapter).v2;
        this.sessionsApi = publicApi.sessions;
        this.tools = publicApi.tools;
        this.toolbelts = publicApi.toolbelts;
        this.connections = publicApi.connections;
        this.users = publicApi.users;
        this.session = new SessionsOperations(apiKey, this.provider, this.sessionsApi);
        this.sessions = this.session;
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
