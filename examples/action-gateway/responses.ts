import { ActionGatewayClient } from "../../src/action-gateway/index.js";

const apiKey = process.env.DIGITALOCEAN_TOKEN!;
const gateway = new ActionGatewayClient({
    apiKey,
    provider: "responses",
});
const session = await gateway.session.create({
    actorId: "end-user-123",
    permissions: {
        defaultAction: "ask",
        rules: [{ tool: "exa_web_search", action: "allow" }],
    },
});

const response = await gateway.responses.create({
    model: "openai-gpt-4o",
    input: "Find the latest DigitalOcean news and summarize it.",
    tools: await session.tools(),
});

console.dir(await session.handleToolCalls(response), { depth: null });
