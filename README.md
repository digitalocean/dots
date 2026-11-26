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

## **Harness Runtime (managed agents)**
`@digitalocean/dots/harness-runtime` runs managed agents: create a session from an agent manifest, stream its work, approve its risky steps, fork it, keep files in a persistent workspace, and start it from a schedule or a webhook.

```typescript
import { HarnessRuntime } from "@digitalocean/dots/harness-runtime";

const hr = new HarnessRuntime(); // reads DIGITALOCEAN_ACCESS_TOKEN
const session = await hr.sessions.create({ manifest });
const result = await session.run("Find and fix the flaky test", { onText: (t) => process.stdout.write(t) });
```

More examples, the error types and the current limitations are in [examples/harness-runtime](examples/harness-runtime/README.md).

## **Sandboxes**
`@digitalocean/dots/sandbox` creates and manages DigitalOcean Sandboxes (`/v2/sandboxes`). It reads the token from `DIGITALOCEAN_ACCESS_TOKEN`, or you can pass `token`.

```typescript
import { Sandbox } from "@digitalocean/dots/sandbox";

const sandbox = await Sandbox.create({
    template: "coding-base",       // optional, defaults to coding-base
    size: "mars-2vcpu-4gb",        // optional, defaults to mars-2vcpu-4gb
    allowInternetAccess: true,    // optional, false limits egress to the platform file-transfer host
    envVars: { MY_KEY: "value" }, // optional, values are secrets
});
console.log(sandbox.sandboxId, sandbox.state);

await sandbox.pause();
await sandbox.resume();
await sandbox.kill();
```

#### Finding existing sandboxes
```typescript
const again = await Sandbox.get(sandboxId);       // fetch by id
const ready = await Sandbox.connect(sandboxId);   // fetch, and resume it if it is paused

// list() walks every page; filter by state if you like
for await (const sb of Sandbox.list({ state: "SANDBOX_STATE_RUNNING" })) {
    console.log(sb.sandboxId, sb.template, sb.info.sizeSlug);
}

// or one page at a time
const pages = Sandbox.list({ limit: 50 });
while (pages.hasNext) {
    for (const sb of await pages.nextItems()) console.log(sb.sandboxId);
}
```

#### Cleaning up
```typescript
await Sandbox.kill(sandboxId);   // false if it is already gone
await Sandbox.pause(sandboxId);

// TypeScript 5.2+: killed at the end of the scope
await using tmp = await Sandbox.create({ template: "coding-base" });
```

`sandbox.getInfo()` re-reads the sandbox, `sandbox.isRunning()` checks its state, and `sandbox.waitUntilRunning()` polls until it is running.

#### Binding a token once
```typescript
import { SandboxClient } from "@digitalocean/dots/sandbox";

const client = new SandboxClient({ token: process.env.DIGITALOCEAN_ACCESS_TOKEN });
const sandbox = await client.Sandbox.create({ template: "coding-base" });
```

#### Errors
Every failed call throws a subclass of `SandboxError` with `status`, `code`, `requestId` and, for 429, `retryAfter`:

```typescript
import { Sandbox, NotFoundError, RateLimitError } from "@digitalocean/dots/sandbox";

try {
    await Sandbox.create({ template: "missing" });
} catch (err) {
    if (err instanceof NotFoundError) console.error("no such template", err.requestId);
    else if (err instanceof RateLimitError) console.error("retry in", err.retryAfter, "s");
    else throw err;
}
```

The other types are `AuthenticationError` (401), `PermissionDeniedError` (403), `InvalidRequestError` (400, 422), `ConflictError` (409), `ServiceError` (5xx) and `SandboxTimeoutError`. An option the SDK does not support, such as `timeoutMs` on `create`, throws before any request is sent.

#### Running commands
```typescript
// A shell command (bash -lc): wait for it and read the result
const result = await sandbox.commands.run('echo "Hello"', {
    cwd: "/workspace",
    onStdout: (text) => process.stdout.write(text), // optional, as output arrives
});
console.log(result.stdout, result.exitCode);        // a non-zero exit code is returned, not thrown

// An executable and its arguments: start it, then attach, write to it or stop it
const cmd = await sandbox.commands.start("cat", { stdin: true });
await cmd.writeStdin("hello\n", { eof: true });
for await (const event of cmd.stream()) {           // started, stdout, stderr, exit
    if (event.type === "stdout") process.stdout.write(event.text);
}

const running = await sandbox.commands.list();       // [{ pid, cmd, cwd }]
await sandbox.commands.connect(running[0].pid).kill(); // SIGTERM; kill("SIGKILL") to force
```

#### Custom templates
```typescript
import { Template } from "@digitalocean/dots/sandbox";

// Build a template from an OCI image (rebased onto a base template, coding-base by default)
const template = await Template.create({
    name: "my-template",
    sourceOciRef: "registry.digitalocean.com/my-team/my-image:v1",
});
await template.waitUntilReady();                          // the build is asynchronous; throws if it fails
const sandbox = await Sandbox.create({ template: template.name });

for await (const t of Template.list()) console.log(t.templateId, t.name, t.status);
await template.update({ sourceOciRef: "registry.digitalocean.com/my-team/my-image:v2" }); // starts a new build
const builds = await template.builds().nextItems();       // [{ buildId, status, error, ... }]
await template.delete();                                  // false if it is already gone
```

`Template.get(id)`, `Template.delete(id)` and `new SandboxClient(opts).Template` work like their sandbox counterparts. Global base templates are not listed: pass them by name to `Sandbox.create`.

Output can only be read while a command runs: a command that exits before the stream attaches fails with `NotFoundError`.

#### Snapshots
```typescript
import { Snapshot } from "@digitalocean/dots/sandbox";

// Snapshot a running or paused sandbox. Creation is asynchronous: the snapshot starts in CREATING.
const snapshot = await sandbox.createSnapshot({ name: "before-upgrade", ttl: "168h" }); // both optional
await snapshot.waitUntilReady();                          // polls until COMPLETE; throws with the API's error if it FAILED
console.log(snapshot.snapshotId, snapshot.state, snapshot.info.sizeBytes);

for await (const s of Snapshot.list({ sandboxId: sandbox.sandboxId })) console.log(s.name, s.state); // newest first
const again = await Snapshot.get(snapshot.snapshotId);
await snapshot.delete();                                  // false if it is already gone; Snapshot.delete(id) works too
```

`name` is 1 to 63 characters: lowercase letters, digits and hyphens. It is checked before the request is sent. `ttl` is a duration string such as `168h`; when it is unset the platform default applies. The snapshot captures the sandbox's boot disk and memory, not its workspace data disk, and the sandbox must be on a microVM cell. `new SandboxClient(opts).Snapshot` works like the other namespaces. The API has no call to start a sandbox from a snapshot yet, so the SDK has none either.

#### Files
```typescript
// Write and read a file (up to 50 MiB). A string is written as UTF-8; Uint8Array, ArrayBuffer and Blob work too.
await sandbox.files.write("/workspace/hello.txt", "Hello\n");   // { path, bytesWritten }
const text = await sandbox.files.readText("/workspace/hello.txt");
const bytes = await sandbox.files.read("/workspace/hello.txt");  // Uint8Array

// Directories travel as tar archives
await sandbox.files.writeArchive("/workspace/src", tarBytes);    // extracts into /workspace/src
const tar = await sandbox.files.readArchive("/workspace/src");

for (const e of await sandbox.files.list("/workspace", { depth: 2 })) console.log(e.type, e.path, e.size);
const info = await sandbox.files.getInfo("/workspace/hello.txt");  // NotFoundError when missing
if (await sandbox.files.exists("/workspace/out")) { /* ... */ }
const { created, entry } = await sandbox.files.makeDir("/workspace/out/logs"); // creates parents; created is false if it existed
await sandbox.files.move("/workspace/hello.txt", "/workspace/out/hello.txt");
await sandbox.files.remove("/workspace/out");                     // a missing path is not an error
```

Every upload sends the body's SHA-256 in `X-Content-Sha256`, and the sandbox checks it after the write. Every download ends in an integrity footer that the SDK checks against the payload and strips; a mismatch or a missing footer throws `SandboxError`. A transfer that answers `503` (too many concurrent transfers) is retried three times with backoff, honoring `Retry-After`, before it throws `ServiceError`. A `FileEntry` has `name`, `type` (`"file"`, `"directory"`, `"symlink"` or `"unspecified"`), `path`, `size` and `mode` as numbers, and `permissions`, `owner`, `group`, `modifiedTime` and `symlinkTarget` when set. Paths are checked before the request is sent.

#### Exec
```typescript
// Call sandbox.exec directly to run a command and wait for it. It does not throw on a non-zero exit.
const r = await sandbox.exec("pytest -x", { cwd: "/workspace", env: { CI: "1" }, timeout: "2m" });
console.log(r.stdout, r.stderr, r.exitCode, r.ok);        // ok is exitCode === 0
await sandbox.exec("pytest -x", { check: true });         // throws CommandError (with .result) on a non-zero exit

// sandbox.exec.run takes the same options as exec.run(...) with onStdout and onStderr callbacks.
// Output streams back on the same request, so even a command that exits at once is not missed.
const result = await sandbox.exec.run("echo hello; echo oops >&2; exit 3", {
    cwd: "/workspace",
    onStdout: (text) => process.stdout.write(text), // optional, as output arrives
});
console.log(result.stdout, result.stderr, result.exitCode, result.durationMs); // a non-zero exit code is returned, not thrown
await sandbox.exec.run(["python3", "-c", "print(1)"]);   // an argv array runs as is
await sandbox.exec.run(["cat"], { stdin: "hi\n" });       // stdin sent with the start request

// Interactive: stdin stays open, and execId is known once start returns
const session = await sandbox.exec.start(["cat"]);
await session.writeStdin("hello\n");                     // the stdin offset is tracked for you
await session.closeStdin();
for await (const event of session) {                      // started, stdout, stderr, exit
    if (event.type === "stdout") process.stdout.write(event.text);
}

// A PTY; an omitted command starts the default shell
const shell = await sandbox.exec.start(undefined, { pty: { rows: 24, cols: 80, term: "xterm-256color" } });
await shell.resize(40, 120);
shell.close();                                            // disconnects; the process may keep running
```

Prefer `exec.run` over `commands.run` for short commands: `commands.run` attaches to the output after the command starts, so a command that exits first fails with `NotFoundError`. A stream that ends without an exit event throws `SandboxError`. Options are checked before the request is sent: a command is required unless `pty` is set, `timeoutSeconds` must be a non-negative integer, and PTY rows and columns must be 1 to 1000.

#### Agent sessions (managed harness)
`Sandbox` is one entry point for two APIs. The kind of object decides the API for every call on it:

| You call | API | You get |
| --- | --- | --- |
| `Sandbox.create()` | sandbox API, `POST /v2/sandboxes` | `Sandbox` (`kind: "sandbox"`, has `sandboxId`) |
| `Sandbox.create({ agent })` or `Sandbox.create({ manifest })` | harness API, `POST /v2/harness-runtime/sessions` | `AgentSandbox` (`kind: "session"`, has `sessionId` and `sandboxId`) |
| `Sandbox.get(id)`, `Sandbox.connect(id)`, `Sandbox.list()` | sandbox API | `Sandbox` |
| `Sandbox.get(id, { kind: "session" })`, `Sandbox.getSession(id)` | harness API | `AgentSandbox` |
| `Sandbox.list({ kind: "session" })` | harness API | async iterator of `AgentSandbox` |

```typescript
import { readFileSync } from "node:fs";
import { Agent, Sandbox } from "@digitalocean/dots/sandbox";

// Describe the agent with `Agent`. The SDK builds the manifest for you. A plain object works too:
// `agent: { harness: "opencode", model: "..." }`.
await using box = await Sandbox.create({
    agent: new Agent("opencode", { model: "anthropic-claude-5.5-haiku", permissions: { default: "allow", rules: [{ tool: "bash", action: "ask" }] } }),
});

// Or pass a full manifest (YAML text or an object). Either way it must name an agent, such as `harness: opencode`.
// A complete one is in examples/harness-runtime/agent.yaml. Pass `agent` or `manifest`, not both.
await using fromFile = await Sandbox.create({ manifest: readFileSync("agent.yaml", "utf8") });

await box.exec("pytest -x", { cwd: "/workspace", env: { CI: "1" }, timeout: "2m", check: true }); // same options and result as a bare sandbox
await box.files.upload("a.txt", "hi");       // harness files: upload, download, downloadText, copyFromLocal, copyToLocal
await box.run("Fix the failing test");       // the agent; box.send() and box.events() too
const agent = box.agent();                   // the agent only: run, send, events, history, cancel, resolveApproval
await box.pause(); await box.resume();
box.session;                                 // the full harness Session: spawn with live stdin, checkpoint, fork, approvals
```

Every `AgentSandbox` method is the harness API. The shortcuts on `box` are thin wrappers over `box.session`, which is the underlying harness `Session`:

| On `box` | Same as | Notes |
| --- | --- | --- |
| `box.send(text)`, `box.run(text, opts)`, `box.events()` | `box.agent().send`, `.run`, `.events` (and `box.session.*`) | the agent; `run` waits for the turn, `send` returns the run id |
| `box.agent()` | | an `AgentHandle`: `run`, `send`, `events`, `history`, `cancel` (`acked`, `no_turn`, `unsupported`) and `resolveApproval`. It never touches the sandbox, so `exec` and `files` stay on `box` |
| `box.pause()`, `box.resume()`, `box.kill()` | `box.session.pause`, `.resume`, `.destroy` | `kill` also deletes the saved config; `false` if already gone |
| `box.getInfo()`, `box.waitUntilReady()` | `box.session.refresh`, `.waitUntilReady` | |
| `box.files` | `box.session.files` | the same object |
| `box.exec(cmd, opts)` | `box.session.exec`, with the bare sandbox's options and result | `box.session.exec` takes `timeoutMs`, returns no `ok`, and has no `check` or `env`/`timeout` aliases |
| only on `box.session` | | `spawn`, `checkpoint`, `fork`, `rollback`, `cancel`, `resolveApproval`, `updateConfig`, `history`, `portForward` |

Both spellings call the harness API, so `box.send("hi")` and `box.session.send("hi")` do the same thing. Use the one on `box` when it exists. Use `box.session` for what it does not wrap.

- **`kind` on `get` and `list`:** `kind` is `"sandbox"` by default. `{ kind: "session" }` uses the harness API only. A call never queries both APIs or falls back, so a sandbox id passed to `get(id, { kind: "session" })` is a `NotFoundError` unless it is a session id. `list` with `kind: "session"` takes `status` and `search`; the sandbox form takes `state`, `limit` and `nextToken`.
- **Create options:** `new Agent(harness, options)` (or the plain object `{ harness, ...options }`) takes `harness` (required), `model` (sent as `HARNESS_INFERENCE_MODEL`), `env`, `secrets` and `permissions`. `agent` and `manifest` are alternatives: passing both, an unknown `agent` key, or `model` together with `env.HARNESS_INFERENCE_MODEL` is an error before any request. Both forms also take `name`, `wait`, `timeoutMs` and `manageModelAccessKey`, and reject `template`, `size`, `allowInternetAccess` and `envVars`, and an agent that is `sandbox` or `none`. For a bare sandbox call `Sandbox.create()`.
- **No mixing.** A bare `Sandbox` never calls the harness API, and an `AgentSandbox` never calls the sandbox API (its `sandboxId` is informational: a rollback replaces it). Session operations are blocked on a bare sandbox. It has no `send`, `run` or `events`, so `sandbox.send()` is a compile error in TypeScript and a `TypeError: sandbox.send is not a function` in plain JavaScript or a REPL, with no request sent. `sandbox.session` throws `UnsupportedError`, and its type is `never`, so `sandbox.session.send()` does not compile either. A PTY (`exec.start`) is the sandbox API's, so an `AgentSandbox` has none: use `box.session.spawn(cmd, { stdin: true })` for live stdin.
- **Cleanup:** `box.kill()` destroys the session, deletes the config saved for the manifest, and revokes the managed key. It resolves `false` if the session is already gone. `await using` does the same at the end of a scope.
- **Errors:** harness errors come back as the sandbox error classes (`NotFoundError`, `ConflictError`, `SandboxTimeoutError`, and so on), so one `catch` covers both APIs.
- **Differences from a bare sandbox:** `box.exec` runs a string as `sh -c` (the bare sandbox uses `bash -lc`), starts in `/workspace` when `cwd` is omitted, and keeps at most 1 MiB per stream unless you stream (`truncated` says so). `box.files` has the harness methods, not `list`, `move` or `makeDir`. `box.status` is the raw `SESSION_STATUS_*` string.

Runnable examples, one per call: [examples/agentSandbox](examples/agentSandbox/README.md) (create, get and list, exec, files, run/send/events, spawn, lifecycle, errors, client, approvals, the `agent` option). A short side-by-side of both kinds: [examples/sandbox/12-agent-session.ts](examples/sandbox/12-agent-session.ts).

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
