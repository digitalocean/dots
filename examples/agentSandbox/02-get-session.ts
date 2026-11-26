/**
 * Sandbox.getSession(id): fetch an existing agent session through the harness API.
 *
 *   npx tsx examples/agentSandbox/02-get-session.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the session fetched by id, then a NotFoundError for an id that does not exist.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { AgentSandbox, NotFoundError, Sandbox } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");

await using created = await Sandbox.create({ manifest });

// Sandbox.getSession(id) is GET /v2/harness-runtime/sessions/{id}. It returns an AgentSandbox, the same
// kind of object create({ manifest }) returns, so you can reconnect to a session from another process.
const box = await Sandbox.getSession(created.sessionId);
console.log(`${box.kind} ${box.sessionId} on sandbox ${box.sandboxId}, ${box.status}`);
console.log(`instanceof AgentSandbox: ${box instanceof AgentSandbox}`);

// The same call, spelled with `kind`: get(id, { kind: "session" }) is the harness API only.
const same = await Sandbox.get(created.sessionId, { kind: "session" });
console.log(`get kind session: ${same.kind} ${same.sessionId}`);

// list({ kind: "session" }) walks the team's sessions through the harness API. status and search filter it.
let n = 0;
for await (const s of Sandbox.list({ kind: "session", status: "SESSION_STATUS_READY" })) {
    if (++n <= 3) console.log(`list      ${s.sessionId} ${s.status}`);
}
console.log(`${n} ready sessions`);

// Sandbox.get(id), Sandbox.connect(id) and Sandbox.list() without kind are the sandbox API: they fetch bare
// sandboxes. Pick the kind that matches how the sandbox was created. Nothing probes the other API or falls back.

// A harness 404 arrives as the sandbox NotFoundError, so one catch covers both APIs.
try {
    await Sandbox.getSession("00000000-0000-0000-0000-000000000000");
} catch (err) {
    console.log(`missing id: ${err instanceof NotFoundError ? "NotFoundError" : err}`);
}
