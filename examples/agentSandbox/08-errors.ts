/**
 * Errors: harness errors arrive as the sandbox error classes, and a call the object cannot do throws
 * UnsupportedError before any request.
 *
 *   npx tsx examples/agentSandbox/08-errors.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see each case with its class name and message.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { NotFoundError, Sandbox, SandboxError } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");

async function show(label: string, run: () => unknown): Promise<void> {
    try {
        await run();
        console.log(`${label}\n  no error (unexpected)`);
    } catch (err) {
        if (!(err instanceof SandboxError)) throw err; // not an SDK error: a bug in your code
        console.log(`${label}\n  ${err.constructor.name}: ${err.message}`);
    }
}

// 1. A manifest that names no agent is refused. Use Sandbox.create() for a bare sandbox.
await show("1. harness: sandbox", () => Sandbox.create({ manifest: "harness: sandbox\n" }));

// 2. A manifest cannot be combined with a bare sandbox's options, and a misspelled option is rejected.
await show("2. manifest with template", () => Sandbox.create({ manifest, template: "coding-base" } as never));
await show("3. unknown option", () => Sandbox.create({ manifest, size_slug: "x" } as never));

// 4. A harness 404 is the sandbox NotFoundError, so one catch covers both APIs.
await show("4. getSession that does not exist", () => Sandbox.getSession("00000000-0000-0000-0000-000000000000"));
try {
    await Sandbox.getSession("00000000-0000-0000-0000-000000000000");
} catch (err) {
    console.log(`  instanceof NotFoundError: ${err instanceof NotFoundError}`);
}

await using box = await Sandbox.create({ manifest });

// 5. exec options are checked before the request: there is no `via`, and `env` and `envVars` are one option.
await show("5. via", () => box.exec("ls", { via: "sandbox" } as never));
await show("6. env and envVars", () => box.exec("ls", { env: {}, envVars: {} }));

// 7. box.exec is the sandbox API, so it has exec.start (a PTY). The harness API's exec has none: box.agent.exec.
console.log(`7. box.exec.start: ${typeof box.exec.start}, box.agent.exec.start: ${typeof (box.agent.exec as unknown as { start?: unknown }).start}`);

// 8. A bare sandbox is the mirror image: its `agent` calls reject with UnsupportedError (see examples/sandbox).
await using bare = await Sandbox.create();
await show("8. bare.agent", () => bare.agent);
