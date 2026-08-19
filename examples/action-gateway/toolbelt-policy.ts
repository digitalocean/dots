import { ActionGatewayClient } from "../../src/action-gateway/index.js";

const gateway = new ActionGatewayClient({
    apiKey: process.env.DIGITALOCEAN_TOKEN!,
});
const toolbelt = await gateway.createToolbelt({
    name: "search-toolbelt",
    tools: ["exa_web_search", "exa_web_fetch"],
});

const session = await gateway.session.create({
    actorId: "end-user-123",
    permissions: {
        defaultAction: "ask",
        rules: [{ tool: `toolbelt:${toolbelt.ref}`, action: "allow" }],
    },
});

console.log(session.url);
