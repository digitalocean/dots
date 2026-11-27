/**
 * Sandbox.create({ manifest }): create an agent session through the harness API.
 *
 *   npx tsx examples/agentSandbox/01-create.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the session and sandbox ids for each way of creating one, then the refusals.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { Sandbox, SandboxError } from "../../src/dots/sandbox/index.js";

// A real agent manifest: OpenCode on a DigitalOcean model. Creating the session does not run the agent.
const yaml = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");

// 1. YAML text. Resolves once the session is READY. `await using` kills it at the end of the script.
await using a = await Sandbox.create({ manifest: yaml });
console.log(`yaml     ${a.kind} session ${a.sessionId} on sandbox ${a.sandboxId}, ${a.status}`);

// 2. The same manifest as an object (sent as JSON, which is valid YAML), with a name.
await using b = await Sandbox.create({
    manifest: { harness: "opencode", env: { HARNESS_INFERENCE_MODEL: "anthropic-claude-5.5-haiku" } },
    name: `agent-example-${Date.now()}`,
});
console.log(`object   session ${b.sessionId}`);

// 3. wait: false returns as soon as the session is allocated. Wait yourself with box.agent.waitUntilReady.
await using c = await Sandbox.create({ manifest: yaml, wait: false });
console.log(`wait:false  status ${c.status}`);
await c.agent.waitUntilReady({ timeoutMs: 5 * 60_000 });
console.log(`ready       status ${c.status}`);

// 4. timeoutMs bounds the wait. A session that is not ready in time is destroyed and SandboxTimeoutError is thrown.
// 5. manageModelAccessKey: false skips the managed inference key (bring HARNESS_INFERENCE_API_KEY in secrets).
//    await Sandbox.create({ manifest: yaml, timeoutMs: 60_000, manageModelAccessKey: false });

// Refused before any request:
for (const [label, run] of [
    ["manifest that names no agent", () => Sandbox.create({ manifest: { harness: "sandbox" } })],
    ["manifest with a bare-sandbox option", () => Sandbox.create({ manifest: yaml, template: "coding-base" } as never)],
    ["unknown option", () => Sandbox.create({ manifest: yaml, region: "nyc3" } as never)],
] as const) {
    try {
        await run();
    } catch (err) {
        if (!(err instanceof SandboxError)) throw err;
        console.log(`${label}: ${err.constructor.name}: ${err.message}`);
    }
}
