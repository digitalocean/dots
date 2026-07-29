# Action Gateway

The TypeScript SDK uses a session-first Action Gateway flow. Create a session
on the DigitalOcean public API, then discover or invoke tools through the
returned session MCP URL with authentication and actor headers managed by the
SDK.

```ts
import { ActionGatewayClient } from "@digitalocean/dots/action_gateway";

const gateway = new ActionGatewayClient({
  apiKey: process.env.DIGITALOCEAN_TOKEN!,
});
const session = await gateway.session.create({ actorId: "end-user-123" });
```

Session creation sends `actor_id`, `name`, and typed `policy` to
`POST /v2/action-gateway/sessions`. The default policy action is `ask`. Use the
optional `tools` field to select tools (omit it for all tools, or pass `[]` for
none) and `config.preloadTools` to expose concrete tools alongside the three
meta-tools on the returned MCP endpoint.

```ts
const session = await gateway.session.create({
  actorId: "end-user-123",
  tools: ["exa_web_search@v1"],
  config: { preloadTools: ["exa_web_search@v1"] },
});

console.log(session.url); // API-returned mcpUrl
```

The controls are complementary: top-level `tools` selects the catalog visible
to `action_search` and callable through `action_invoke`, `config.preloadTools`
also exposes selected concrete tools directly, and `permissions` applies
`allow`, `ask`, or `deny` when any selected tool is invoked. See
`examples/action-gateway/session-controls.ts` for a complete configuration.

If a policy returns a pending approval, decide it and retry the invocation:

```ts
await session.approve(approvalId);
// or: await session.deny(approvalId);
```

## Toolbelts

Toolbelts are public DigitalOcean API resources, so CRUD operations are
generated from the public OpenAPI specification under `gateway.toolbelts`.
`createToolbelt` is the Action Gateway convenience wrapper:

```ts
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
```

See `examples/action-gateway/` for Chat Completions, Messages, Responses,
direct tool and code execution, asynchronous usage, toolbelt creation, and
toolbelt policy examples.
