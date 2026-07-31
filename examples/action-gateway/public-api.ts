import { ActionGatewayClient } from "../../src/action-gateway/index.js";
import type { Create_connection_request } from "../../src/dots/models/index.js";

const gateway = new ActionGatewayClient({
    apiKey: process.env.DIGITALOCEAN_TOKEN!,
});
const actorId = process.env.ACTOR_ID ?? "example-user";

// Public Tool Registry APIs are generated from DigitalOcean's OpenAPI spec.
console.log("Tools:", await gateway.tools.get({
    queryParameters: { toolkitId: "exa" },
}));
console.log("Toolkits:", await gateway.tools.toolkits.get());
console.log("Providers:", await gateway.tools.providers.get());
console.log("Definition:", await gateway.tools.byName("exa_web_search").definition.get({
    queryParameters: { version: "v1" },
}));

// Toolbelts support create, list, get, membership changes, and delete.
console.log("Created toolbelt:", await gateway.toolbelts.post({
    name: "search-toolbelt",
    tools: ["exa_web_search"],
}));
console.log("Toolbelts:", await gateway.toolbelts.get({
    queryParameters: { status: "active" },
}));
const toolbelt = gateway.toolbelts.byName("search-toolbelt");
console.log("Toolbelt:", await toolbelt.get());
await toolbelt.tools.add.post({ tools: ["exa_web_fetch"] });
await toolbelt.tools.remove.post({ tools: ["exa_web_fetch"] });

// Connections support create, list, get, parameter updates, and delete.
const connectionRequest: Create_connection_request = {
    provider: "github",
    userId: actorId,
    scopes: ["repo"],
};
console.log("Created connection:", await gateway.connections.post(connectionRequest));
console.log("Connections:", await gateway.connections.get({
    queryParameters: { userId: actorId },
}));

const connectionId = process.env.CONNECTION_ID;
if (connectionId) {
    const connection = gateway.connections.byId(connectionId);
    console.log("Connection:", await connection.get());
    await connection.patch({
        connectionParameters: {
            additionalData: { site_url: "https://github.com" },
        },
    });
    await connection.delete();
}

// Users are derived from their sessions and connections.
console.log("Users:", await gateway.users.get());
console.log("User:", await gateway.users.byUser_id(actorId).get());

// The convenience API delegates session creation to the generated resource
// and returns a session bound to response.mcpUrl.
console.log("Sessions:", await gateway.sessionsApi.get({
    queryParameters: { endUserId: actorId },
}));
const session = await gateway.session.create({
    actorId,
    tools: ["exa_web_search@v1"],
    config: { preloadTools: ["exa_web_search@v1"] },
    permissions: { defaultAction: "ask" },
});
console.log("Session MCP URL:", session.url);

const sessionUrn = process.env.SESSION_URN;
if (sessionUrn) {
    await gateway.sessionsApi.bySession_urn(sessionUrn).delete();
}

// Uncomment when the example toolbelt is no longer needed.
// await toolbelt.delete();
