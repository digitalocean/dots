/**
 * The life of an agent session. box.pause, resume, kill and getInfo are the sandbox API, on the session's
 * sandbox. box.agent.pause, resume, refresh, waitUntilReady and destroy are the harness API.
 *
 *   npx tsx examples/agentSandbox/07-lifecycle.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the sandbox state at each step, then kill answer true and then false.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { Sandbox } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");

const box = await Sandbox.create({ manifest });
process.once("SIGINT", () => void box.agent.destroy().finally(() => process.exit(130)));
console.log(`created   session ${box.sessionId} (${box.status}) on sandbox ${box.sandboxId}`);

// Sandbox API: GET /v2/sandboxes/{sandboxId}, then pause and resume.
console.log(`getInfo   state ${(await box.getInfo()).state}`);
console.log(`pause     state ${(await box.pause()).state}`);
console.log(`resume    state ${(await box.resume()).state}`);

// Harness API: the session's own record. A rollback replaces the sandbox, and box.sandboxId follows it.
await box.agent.refresh();
console.log(`session   status ${box.status}, sandbox ${box.sandboxId}`);

// kill() deletes the sandbox through the sandbox API and resolves false when it is already gone. It leaves the
// session and its saved config, so destroy the session too, which also revokes the managed key.
console.log(`kill      ${await box.kill()}`);
console.log(`kill again ${await box.kill()}`);
await box.agent.destroy();

// `await using box = await Sandbox.create({ manifest })` calls session.destroy at the end of a scope.
