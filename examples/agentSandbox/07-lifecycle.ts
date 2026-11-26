/**
 * The life of an agent session: getInfo, waitUntilReady, pause, resume, kill, and `await using`.
 *
 *   npx tsx examples/agentSandbox/07-lifecycle.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the status at each step, then kill answer true and then false.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { Sandbox } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");

const box = await Sandbox.create({ manifest });
process.once("SIGINT", () => void box.kill().finally(() => process.exit(130)));
console.log(`created   ${box.sessionId}  status ${box.status}, sandbox ${box.sandboxId}`);

// getInfo() reads the session again and returns the same object.
await box.getInfo();
console.log(`getInfo   status ${box.status}`);

// pause and resume use /v2/harness-runtime/sessions/{id}/pause and /resume.
await box.pause();
console.log(`pause     status ${(await box.getInfo()).status}`);
await box.resume();
await box.waitUntilReady({ timeoutMs: 5 * 60_000 }); // SandboxTimeoutError if it takes longer
console.log(`resume    status ${box.status}`);

// sandboxId is informational: it can be empty until a sandbox is allocated, and a rollback replaces it.
// Every call uses sessionId.
console.log(`sandboxId now ${box.sandboxId}`);

// kill() destroys the session and its sandbox, deletes the manifest's saved config and revokes the managed
// key. It resolves false when the session is already gone.
console.log(`kill      ${await box.kill()}`);
console.log(`kill again ${await box.kill()}`);

// `await using box = await Sandbox.create({ manifest })` does the same at the end of a scope.
