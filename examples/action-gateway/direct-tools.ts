import { ActionGatewayClient } from "../../src/action-gateway/index.js";

const gateway = new ActionGatewayClient({
    apiKey: process.env.DIGITALOCEAN_TOKEN!,
});
const session = await gateway.session.create({
    actorId: "end-user-123",
    tools: ["exa_web_search@v1", "execute_code@v1"],
    config: { preloadTools: ["exa_web_search@v1"] },
    permissions: {
        defaultAction: "ask",
        rules: [
            { tool: "exa_web_search", action: "allow" },
            { tool: "execute_code", action: "allow" },
        ],
    },
});

const search = await session.toolsOperations.search("search the web for DigitalOcean news");
const result = await session.toolsOperations.invokeOne("exa_web_search", {
    query: "DigitalOcean news",
    max_results: 5,
});
const code = await session.code.execute("print(sum(range(10)))");

console.dir({ search, result, code }, { depth: null });
