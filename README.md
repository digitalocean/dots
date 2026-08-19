# DoTs
`DoTs` is the official DigitalOcean Typescript Client based on the DO OpenAPIv3 specification. 

> **New** — Inference now lives in its own namespace: `import { Client } from "@digitalocean/dots/inference"`. The legacy `import { InferenceClient } from "@digitalocean/dots"` is still fully supported (`Client` and `InferenceClient` are the same constructor). Jump to [AI & Inference](#ai--inference) for usage.
>
> **New in v1.11.0** — `DoTs` ships first-class support for DigitalOcean Serverless Inference: streaming chat completions, image generation, and model listing. Browse runnable scripts in [`examples/inference/`](./examples/inference).

## Getting Started
#### Prerequisites 
- [NodeJS 20.10 or above](https://nodejs.org/en/)
- [TypeScript 5 or above](https://www.typescriptlang.org/)
- A DigitalOcean account with an active subscription. Along with a DigitalOcean token with proper permissions to manage DigitalOcean resources.
- `"type": "module"` in your package.json (for ES module support)

#### Installation
> The package is published on npmjs.com.
```shell
npm i @digitalocean/dots
```
#### **Documentation**
> Note: Comprehensive documentation quality is currently lacking and under development. The documentation is actively being improved and will be updated once fixed.

https://digitaloceandots.readthedocs.io/en/latest/

#### **Action Gateway**

Use `@digitalocean/dots/action_gateway` for session-bound tools with Chat
Completions, Messages, and Responses. Toolbelt CRUD is generated from the
public DigitalOcean OpenAPI specification, with a `createToolbelt` convenience
method on `ActionGatewayClient`.

See the [Action Gateway guide](docs/action-gateway.md) and
[TypeScript examples](examples/action-gateway/).

## **Basic Usage**
> A quick guide to getting started with client
#### Authenticating 
`dots` must be initialized with `createDigitalOceanClient()`. A DigitalOcean token is required. This token can be passed in via `DigitalOceanApiKeyAuthenticationProvider()`, an example below:
```typescript
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token!);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);
// Create the API client
const client = createDigitalOceanClient(adapter);
```

#### Managing DigitalOcean Resources
Find below a working example of creating a DigitalOcean volume via `dots`:
```typescript
import { createDigitalOceanClient, DigitalOceanApiKeyAuthenticationProvider,
 FetchRequestAdapter, Volumes_ext4 } from "@digitalocean/dots";

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN not set");
}

const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token!);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);
// Create the API client
const client = createDigitalOceanClient(adapter);

async function main(): Promise<void> {
    try {
        const volumeReq: Volumes_ext4 = {
            sizeGigabytes: 10,
            name: `test-volume`,
            description: "Block storage testing",
            region: "nyc3",
            filesystemType: "ext4",
        };

        const resp = await client.v2.volumes.post(volumeReq);
        if (resp && resp.volume) {
            const volume = resp.volume;
            console.log(`Created volume ${volume.name} <ID: ${volume.id}>`);
        } else {
            throw new Error("Failed to create volume or volume is undefined");
        }

        console.log("Done!");

    } catch (err) {
        console.error(err);
    }
}

main();
```

Running the above code snippet with `tsc && node index.js` would output the following:
```
Created volume test-volume <ID: 751d0c09-1613-11f0-8aa5-0a58ac147241>
Done!
```

More working examples can be found in `dots/examples`. 

## **AI & Inference**

> Added in **v1.11.0**. Talk to DigitalOcean Serverless Inference directly from `DoTs` — streaming chat, image generation, model listing, and more.

### Authentication

Inference APIs are gated by a separate credential from the v2 control-plane token. You must use **one** of the following:

- A **DigitalOcean Personal Access Token (PAT) with _full access_ scope** — read/write across all resources, including GenAI/Inference. Tokens scoped only to specific resource types will be rejected.
- A **Model Access Key** issued from the DigitalOcean Cloud console under *GenAI Platform → Model Access Keys*. These are the recommended credential for production workloads since they're scoped only to inference.

The credential is passed as `apiKey` to the inference `Client`. The same `DIGITALOCEAN_TOKEN` env var used elsewhere in this README works here **only if** that PAT has full-access scope; otherwise use a Model Access Key.

```typescript
import { Client } from "@digitalocean/dots/inference";

const client = new Client({
    apiKey: process.env.DIGITALOCEAN_TOKEN!, // full-access PAT or Model Access Key
});
```

### Streaming chat completions

```typescript
import { Client } from "@digitalocean/dots/inference";

const client = new Client({ apiKey: process.env.DIGITALOCEAN_TOKEN! });

const stream = await client.chat.completions.create({
    model: "llama3.3-70b-instruct",
    messages: [{ role: "user", content: "Write two short lines about DigitalOcean." }],
    stream: true,
});

for await (const chunk of stream) {
    process.stdout.write(chunk.choices?.[0]?.delta?.content ?? "");
}
process.stdout.write("\n");
```

Callback-style streaming is also supported:

```typescript
await client.chat.completions.create(
    { model: "llama3.3-70b-instruct", messages, stream: true },
    {
        onData: (chunk) => process.stdout.write(chunk.choices?.[0]?.delta?.content ?? ""),
        onComplete: () => console.log("\n[done]"),
        onError: (err) => console.error(err),
    },
);
```

### Image generation

```typescript
import { Client } from "@digitalocean/dots/inference";

const client = new Client({ apiKey: process.env.DIGITALOCEAN_TOKEN! });

const result = await client.images.generate({
    model: "stable-diffusion-3.5-large", // any image model from `client.models.list()`
    prompt: "An isometric illustration of a serverless data center, soft pastel colors",
    n: 1,
    size: "1024x1024",
});

const img = result.data?.[0];
if (img?.url) {
    console.log(img.url);
} else if (img?.b64_json) {
    // Stable Diffusion returns base64 — decode and save to disk.
    const fs = await import("node:fs");
    fs.writeFileSync("generated-image.png", Buffer.from(img.b64_json, "base64"));
    console.log("Saved generated-image.png");
}
```

### Listing available models

```typescript
import { Client } from "@digitalocean/dots/inference";

const client = new Client({ apiKey: process.env.DIGITALOCEAN_TOKEN! });

const models = await client.models.list();
for (const m of models.data ?? []) {
    console.log(`${m.id}\t${m.owned_by ?? ""}`);
}
```

### Import styles (all equivalent)

The new `@digitalocean/dots/inference` subpath supports all the usual import shapes — pick whichever matches your project's conventions. Every form below resolves to the **same** constructor (`Client === InferenceClient`), so you can mix and match without any runtime difference:

```typescript
// Named import — closest to `from pydo.inference import client`
import { Client } from "@digitalocean/dots/inference";

// Namespace import — gives you Client, ClientOptions, SSEStream, etc. in one bag
import * as inference from "@digitalocean/dots/inference";
const c = new inference.Client({ apiKey });

// Default import
import Client from "@digitalocean/dots/inference";

// Legacy name still reachable through the new subpath
import { InferenceClient } from "@digitalocean/dots/inference";

// Original root import — unchanged, still fully supported
import { InferenceClient } from "@digitalocean/dots";
```

> **Backward compatibility.** The legacy `import { InferenceClient } from "@digitalocean/dots"` continues to work exactly as before. No existing code needs to change. New endpoints added to the OpenAPI spec land automatically in both surfaces — you'll never need to edit `src/inference-gen/inference.ts` to expose them.

### Runnable examples

Minimal, runnable versions of every snippet above live under [`examples/inference/`](./examples/inference):

- [`namespace-usage.ts`](./examples/inference/namespace-usage.ts) — exercises the new `@digitalocean/dots/inference` namespace end-to-end (identity check, `models.list`, non-streaming chat, streaming chat, embeddings).
- [`chat-streaming.ts`](./examples/inference/chat-streaming.ts) — streams a chat completion and prints tokens as they arrive.
- [`image-generation.ts`](./examples/inference/image-generation.ts) — generates a single image with `stable-diffusion-3.5-large`. Prints the URL if the model returns one, otherwise decodes the base64 payload and writes `generated-image.png`.
- [`models-list.ts`](./examples/inference/models-list.ts) — lists the IDs of all models you can call.

Each script only needs `DIGITALOCEAN_TOKEN` set:

```shell
DIGITALOCEAN_TOKEN=... npx tsx examples/inference/namespace-usage.ts
DIGITALOCEAN_TOKEN=... npx tsx examples/inference/chat-streaming.ts
DIGITALOCEAN_TOKEN=... npx tsx examples/inference/image-generation.ts
DIGITALOCEAN_TOKEN=... npx tsx examples/inference/models-list.ts
```

> Seeing `HTTP 401: Unauthorized — Unable to authenticate you`? The token you supplied is either empty, expired, or scoped to specific resources only. Resource-scoped PATs cannot call the inference gateway — use a full-access PAT or a Model Access Key.

## **Known Issues**

>This section lists the known issues of the client generator.
#### Generates nested `value` fields for nested arrays
-  This is an existing issue with our code generated tool, Kiota
-  More details about this issue can be found [here](https://github.com/microsoft/kiota/issues/4549)


## **Roadmap**

`DoTs` covers the DigitalOcean control plane today, and we're actively expanding the AI/Inference surface. Upcoming and in-flight work:

- **Inference**
    - Expanded coverage of Serverless Inference endpoints (responses API, embeddings, audio, async image generation).
    - First-class typings for inference request/response shapes (currently typed loosely as `Record<string, any>` for forward-compat).
    - Helpers for the GenAI Platform control plane: agents, knowledge bases, and Model Access Key management.
    - Built-in retries, rate-limit handling, and structured error types for inference calls.
- **Dedicated Inference**
    - Convenience wrappers for provisioning and managing dedicated inference endpoints and tokens.
- **DX**
    - Better generated docs and end-to-end examples for both control-plane and inference workflows.
    - Expanded examples under `examples/` (including additional `examples/inference/` scripts).

Have a use case you'd like prioritized? [Open an issue](https://github.com/digitalocean/dots/issues) and let us know.

## **Contributing**
>We welcome contributions! Feel free to get involved in developing this client by visiting our [Contribuing Guide](CONTRIBUTING.md) for detailed information and guidelines.
>For feature requests or bug reports, open an issue to help us improve the client.

## **License**

This project is licensed under the Apache License 2.0. See the [LICENSE](./LICENSE) file for details.
