import { ActionGatewayClient } from "../../src/action-gateway/index.js";

const gateway = new ActionGatewayClient({
    apiKey: process.env.DIGITALOCEAN_TOKEN!,
});

const toolbelt = await gateway.createToolbelt({
    name: "search-toolbelt",
    tools: ["exa_web_search", "exa_web_fetch"],
});

console.log(toolbelt.ref); // search-toolbelt@1

// The base CRUD surface is generated from the public OpenAPI specification.
await gateway.toolbelts.get({ queryParameters: { status: "active" } });
await gateway.toolbelts.byName("search-toolbelt").get({
    queryParameters: { version: "1" },
});
await gateway.toolbelts.byName("search-toolbelt").tools.add.post({
    tools: ["jira_create_issue"],
});
await gateway.toolbelts.byName("search-toolbelt").tools.remove.post({
    tools: ["exa_web_fetch"],
});
