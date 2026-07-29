import nock from "nock";

import {
    ActionGatewayClient,
    MessagesProvider,
    ResponsesProvider,
} from "../../src/action-gateway/index.js";

const API_BASE_URL = "https://api.digitalocean.test";
const GATEWAY_BASE_URL = "https://actions.do-ai.test";
const MCP_URL = `${GATEWAY_BASE_URL}/mcp/session/session-123`;

function client(provider?: MessagesProvider | ResponsesProvider): ActionGatewayClient {
    return new ActionGatewayClient({
        apiKey: "test-token",
        apiBaseURL: API_BASE_URL,
        provider,
    });
}

function sessionResponse() {
    return {
        session: {
            sessionUrn: "do:managed_agents_session:session-123",
            name: "support-session",
            actorId: "user-123",
            policy: { defaultAction: "ask", rules: [] },
        },
        mcpUrl: MCP_URL,
        tools: ["exa_web_search@v1"],
    };
}

function mcpResult(result: unknown) {
    return { jsonrpc: "2.0", id: 1, result };
}

describe("Action Gateway", () => {
    afterEach(() => nock.cleanAll());

    it("creates sessions with typed policy, tools, and config", async () => {
        const api = nock(API_BASE_URL)
            .post("/v2/sessions", (body) => {
                expect(body).toEqual({
                    actor_id: "user-123",
                    name: "support-session",
                    policy: {
                        defaultAction: "ask",
                        rules: [{ tool: "toolbelt:search-toolbelt@1", action: "allow" }],
                    },
                    tools: ["toolbelt:search-toolbelt@1"],
                    config: { preloadTools: ["exa_web_search@v1"] },
                });
                return true;
            })
            .reply(200, sessionResponse());

        const session = await client().session.create({
            actorId: "user-123",
            name: "support-session",
            permissions: {
                defaultAction: "ask",
                rules: [{ tool: "toolbelt:search-toolbelt@1", action: "allow" }],
            },
            tools: ["toolbelt:search-toolbelt@1"],
            config: { preloadTools: ["exa_web_search@v1"] },
        });

        expect(session.id).toBe("session-123");
        expect(session.url).toBe(MCP_URL);
        expect(session.selectedTools).toEqual(["exa_web_search@v1"]);
        api.done();
    });

    it("defaults session policy to ask", async () => {
        const api = nock(API_BASE_URL)
            .post("/v2/sessions", (body) => body.policy.defaultAction === "ask")
            .reply(200, sessionResponse());

        await client().session.create({ actorId: "user-123" });
        api.done();
    });

    it("uses the returned MCP URL with session and actor headers", async () => {
        nock(API_BASE_URL)
            .post("/v2/sessions")
            .reply(200, sessionResponse());
        const gateway = nock(GATEWAY_BASE_URL, {
            reqheaders: {
                "X-Session-Id": "session-123",
                "X-Actor-Id": "user-123",
                "MCP-Protocol-Version": "2025-06-18",
            },
        })
            .post("/mcp/session/session-123", (body) => {
                expect(body.method).toBe("tools/call");
                expect(body.params).toEqual({
                    name: "action_invoke",
                    arguments: {
                        tools: [{ tool: "exa_web_search", arguments: { query: "DigitalOcean" } }],
                    },
                });
                return true;
            })
            .reply(200, mcpResult({
                structuredContent: {
                    results: [{
                        tool: "exa_web_search",
                        result: { status: "succeeded", output: { hits: 3 } },
                    }],
                },
                isError: false,
            }));

        const session = await client().session.create({ actorId: "user-123" });
        const result = await session.toolsOperations.invokeOne("exa_web_search", {
            query: "DigitalOcean",
        });

        expect(result).toEqual({ hits: 3 });
        gateway.done();
    });

    it("approves and denies pending invocations", async () => {
        nock(API_BASE_URL)
            .post("/v2/sessions")
            .reply(200, sessionResponse());
        const gateway = nock(GATEWAY_BASE_URL, {
            reqheaders: {
                "X-Session-Id": "session-123",
                "X-Actor-Id": "user-123",
            },
        })
            .post("/approvals/approval-1", { decision: "approve" })
            .reply(200, { status: "approved" })
            .post("/approvals/approval-2", { decision: "deny" })
            .reply(200, { status: "denied" });

        const session = await client().session.create({ actorId: "user-123" });
        await expect(session.approve("approval-1")).resolves.toEqual({ status: "approved" });
        await expect(session.deny("approval-2")).resolves.toEqual({ status: "denied" });
        gateway.done();
    });

    it("creates toolbelts through the generated public API", async () => {
        const api = nock(API_BASE_URL)
            .post("/v2/toolbelts", {
                name: "search-toolbelt",
                tools: ["exa_web_search", "exa_web_fetch"],
                version: "1",
            })
            .reply(200, {
                toolbelt: {
                    name: "search-toolbelt",
                    version: "1",
                    tools: ["exa_web_search", "exa_web_fetch"],
                    status: "active",
                    reference: "search-toolbelt@1",
                    reference_latest: "search-toolbelt",
                    tool_count: 2,
                    created_at: "2026-07-24T00:00:00Z",
                    updated_at: "2026-07-24T00:00:00Z",
                },
            });

        const toolbelt = await client().createToolbelt({
            name: "search-toolbelt",
            tools: ["exa_web_search", "exa_web_fetch"],
        });

        expect(toolbelt.reference).toBe("search-toolbelt@1");
        expect(toolbelt.ref).toBe("search-toolbelt@1");
        api.done();
    });

    it("exposes generated list, get, add, remove, and delete operations", async () => {
        const gateway = client();
        const toolbelt = {
            name: "search-toolbelt",
            version: "2",
            tools: ["exa_web_search"],
            status: "active",
            reference: "search-toolbelt@2",
            reference_latest: "search-toolbelt",
            tool_count: 1,
            created_at: "2026-07-24T00:00:00Z",
            updated_at: "2026-07-24T00:00:00Z",
        };

        nock(API_BASE_URL)
            .get("/v2/toolbelts")
            .query({ status: "active" })
            .reply(200, { toolbelts: [], pagination: { page: 1, per_page: 20, total: 0 } });
        nock(API_BASE_URL)
            .get("/v2/toolbelts/search-toolbelt")
            .query({ version: "2" })
            .reply(200, { toolbelt });
        nock(API_BASE_URL)
            .post("/v2/toolbelts/search-toolbelt/tools/add", { tools: ["exa_web_fetch"] })
            .reply(200, { toolbelt });
        nock(API_BASE_URL)
            .post("/v2/toolbelts/search-toolbelt/tools/remove", { tools: ["exa_web_fetch"] })
            .reply(200, { toolbelt });
        nock(API_BASE_URL)
            .delete("/v2/toolbelts/search-toolbelt")
            .reply(200, { toolbelt });

        await gateway.toolbelts.get({ queryParameters: { status: "active" } });
        const item = gateway.toolbelts.byName("search-toolbelt");
        await item.get({ queryParameters: { version: "2" } });
        await item.tools.add.post({ tools: ["exa_web_fetch"] });
        await item.tools.remove.post({ tools: ["exa_web_fetch"] });
        const deleted = await item.delete();

        expect(deleted?.toolbelt?.status).toBe("active");
        expect(nock.isDone()).toBe(true);
    });

    it("formats tools for every inference surface", async () => {
        nock(API_BASE_URL)
            .post("/v2/sessions")
            .times(3)
            .reply(200, sessionResponse());

        const chatSession = await client().session.create({ actorId: "user-123" });
        expect((await chatSession.tools())[0]).toMatchObject({
            type: "function",
            function: { name: "action_search" },
        });

        const messagesSession = await client(new MessagesProvider()).session.create({ actorId: "user-123" });
        expect((await messagesSession.tools())[0]).toMatchObject({
            name: "action_search",
            input_schema: { type: "object" },
        });

        const responsesSession = await client(new ResponsesProvider()).session.create({ actorId: "user-123" });
        expect((await responsesSession.tools())[0]).toMatchObject({
            type: "function",
            name: "action_search",
        });
    });

    it("executes and formats model tool calls", async () => {
        nock(API_BASE_URL)
            .post("/v2/sessions")
            .times(3)
            .reply(200, sessionResponse());
        nock(GATEWAY_BASE_URL)
            .post("/mcp/session/session-123")
            .times(3)
            .reply(200, mcpResult({
                structuredContent: {
                    results: [{
                        tool: "exa_web_search",
                        result: { status: "succeeded", output: { hits: 1 } },
                    }],
                },
                isError: false,
            }));

        const chatSession = await client().session.create({ actorId: "user-123" });
        expect(await chatSession.handleToolCalls({
            choices: [{ message: { tool_calls: [{
                id: "chat-1",
                function: { name: "exa_web_search", arguments: '{"query":"DO"}' },
            }] } }],
        })).toEqual([{ role: "tool", tool_call_id: "chat-1", content: '{"hits":1}' }]);

        const messagesSession = await client(new MessagesProvider()).session.create({ actorId: "user-123" });
        expect(await messagesSession.handleToolCalls({
            content: [{ type: "tool_use", id: "message-1", name: "exa_web_search", input: { query: "DO" } }],
        })).toEqual([{ role: "user", content: [{
            type: "tool_result",
            tool_use_id: "message-1",
            content: '{"hits":1}',
        }] }]);

        const responsesSession = await client(new ResponsesProvider()).session.create({ actorId: "user-123" });
        expect(await responsesSession.handleToolCalls({
            output: [{
                type: "function_call",
                call_id: "response-1",
                name: "exa_web_search",
                arguments: '{"query":"DO"}',
            }],
        })).toEqual([{
            type: "function_call_output",
            call_id: "response-1",
            output: '{"hits":1}',
        }]);
    });

    it("preserves approval metadata in model tool results", async () => {
        nock(API_BASE_URL)
            .post("/v2/sessions")
            .reply(200, sessionResponse());
        nock(GATEWAY_BASE_URL)
            .post("/mcp/session/session-123")
            .reply(200, mcpResult({
                structuredContent: {
                    results: [{
                        tool: "exa_web_search",
                        result: {
                            status: "failed",
                            error: { message: "approval required" },
                            _meta: {
                                status: "requires_approval",
                                approval_id: "approval-123",
                            },
                        },
                    }],
                },
                isError: false,
            }))
            .post("/mcp/session/session-123")
            .reply(200, mcpResult({
                content: [{ type: "text", text: "approval required" }],
                isError: true,
                _meta: {
                    status: "requires_approval",
                    approval_id: "approval-123",
                },
            }));

        const session = await client().session.create({ actorId: "user-123" });
        const messages = await session.handleToolCalls({
            choices: [{ message: { tool_calls: [{
                id: "chat-1",
                function: { name: "exa_web_search", arguments: '{"query":"DO"}' },
            }] } }],
        });

        expect(JSON.parse(String(messages[0].content))).toMatchObject({
            error: { message: "approval required" },
            _meta: { approval_id: "approval-123" },
        });

        const directMessages = await session.handleToolCalls({
            choices: [{ message: { tool_calls: [{
                id: "chat-2",
                function: { name: "action_search", arguments: '{"queries":["search"]}' },
            }] } }],
        });

        expect(JSON.parse(String(directMessages[0].content))).toMatchObject({
            error: { message: "approval required" },
            _meta: { approval_id: "approval-123" },
        });
    });
});
