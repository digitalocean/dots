# Action Gateway

The TypeScript SDK uses a session-first Action Gateway flow. Create a session
on the DigitalOcean public API, then discover or invoke tools through
`actions.do-ai.run` with the session and actor headers managed by the SDK.

```ts
import { ActionGatewayClient } from "@digitalocean/dots/action_gateway";

const gateway = new ActionGatewayClient({
  apiKey: process.env.DIGITALOCEAN_TOKEN!,
});
const session = await gateway.session.create({ actorId: "end-user-123" });
```

Session creation sends `actor_id`, `name`, and `policy_json` to
`POST /v2/action-gateway/sessions`. Gateway REST requests use the bare session
UUID in `X-Session-Id` and the actor in `X-Actor-Id`.

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
