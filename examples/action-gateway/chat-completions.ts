import { Client } from "../../src/inference-gen/inference.js";
import { ActionGatewayClient } from "../../src/action-gateway/index.js";

const apiKey = process.env.DIGITALOCEAN_TOKEN!;
const inference = new Client({ apiKey });
const gateway = new ActionGatewayClient({ apiKey });
const session = await gateway.session.create({ actorId: "end-user-123" });

const messages: Record<string, unknown>[] = [{
    role: "user",
    content: "Find the latest DigitalOcean news and summarize it.",
}];

while (true) {
    const response = await inference.chat.completions.create({
        model: "llama3.3-70b-instruct",
        messages,
        tools: await session.tools(),
    });
    const message = response.choices[0].message;
    messages.push(message);
    if (!message.tool_calls?.length) {
        console.log(message.content);
        break;
    }
    messages.push(...await session.handleToolCalls(response));
}
