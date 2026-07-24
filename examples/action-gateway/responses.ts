import { Client } from "../../src/inference-gen/inference.js";
import {
    ActionGatewayClient,
    ResponsesProvider,
} from "../../src/action-gateway/index.js";

const apiKey = process.env.DIGITALOCEAN_TOKEN!;
const inference = new Client({ apiKey });
const gateway = new ActionGatewayClient({
    apiKey,
    provider: new ResponsesProvider(),
});
const session = await gateway.session.create({ actorId: "end-user-123" });

const response = await inference.responses.create({
    model: "openai-gpt-4o",
    input: "What DigitalOcean Droplet sizes are available in NYC3?",
    tools: await session.tools(),
});

console.dir(await session.handleToolCalls(response), { depth: null });
