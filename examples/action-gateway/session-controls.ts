import { ActionGatewayClient } from "../../src/action-gateway/index.js";

const gateway = new ActionGatewayClient({
    apiKey: process.env.DIGITALOCEAN_TOKEN!,
});
const session = await gateway.session.create({
    actorId: "end-user-123",

    tools: ["exa_web_search@v1", "exa_web_fetch@v1"],
    config: { preloadTools: ["exa_web_search@v1"] },
    permissions: {
        defaultAction: "deny",
        rules: [
            { tool: "exa_web_search", action: "allow" },
            { tool: "exa_web_fetch", action: "ask" },
        ],
    },
});

console.log("MCP URL:", session.url);
console.log("Selected for search/invoke:", session.selectedTools);
console.log(
    "Exposed directly:",
    (await session.toolsOperations.list({ includeAll: true })).map((tool) => tool.name),
);

const results = await session.toolsOperations.search("search or fetch a public web page");
console.dir(results, { depth: null });
