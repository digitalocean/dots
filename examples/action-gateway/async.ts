import { ActionGatewayClient } from "../../src/action-gateway/index.js";

const gateway = new ActionGatewayClient({
    apiKey: process.env.DIGITALOCEAN_TOKEN!,
});
const session = await gateway.session.create({ actorId: "end-user-123" });

const [tools, catalog] = await Promise.all([
    session.tools(),
    session.toolsOperations.list({ includeAll: true }),
]);

console.log(`Loaded ${tools.length} model tools and ${catalog.length} catalog tools.`);
