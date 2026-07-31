import { Client } from "../../src/inference-gen/inference.js";
import {
    ActionGatewayClient,
    MessagesProvider,
} from "../../src/action-gateway/index.js";

const apiKey = process.env.DIGITALOCEAN_TOKEN!;
const inference = new Client({ apiKey });
const gateway = new ActionGatewayClient({
    apiKey,
    provider: new MessagesProvider(),
});
const session = await gateway.session.create({
    actorId: "end-user-123",
    permissions: {
        defaultAction: "ask",
        rules: [
            { tool: "exa_web_search", action: "allow" },
            { tool: "exa_web_fetch", action: "allow" },
        ],
    },
});

const response = await inference.messages.create({
    model: "anthropic-claude-sonnet-4",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Find the latest DigitalOcean news." }],
    tools: await session.tools(),
});

console.dir(await session.handleToolCalls(response), { depth: null });
