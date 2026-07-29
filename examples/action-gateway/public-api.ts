import { ActionGatewayClient } from "../../src/action-gateway/index.js";

const gateway = new ActionGatewayClient({
    apiKey: process.env.DIGITALOCEAN_TOKEN!,
});

// Public Tool Registry APIs are generated from DigitalOcean's OpenAPI spec.
console.log(await gateway.tools.get());
console.log(await gateway.tools.toolkits.get());
console.log(await gateway.tools.providers.get());
console.log(await gateway.tools.byName("exa_web_search").definition.get({
    queryParameters: { version: "v1" },
}));

console.log(await gateway.connections.get({
    queryParameters: { userId: "example-user" },
}));
console.log(await gateway.users.get());
console.log(await gateway.sessionsApi.get({
    queryParameters: { endUserId: "example-user" },
}));
