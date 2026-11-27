/**
 * A bare sandbox and an agent session from the same `Sandbox` entry point.
 *
 *   npx tsx examples/sandbox/12-agent-session.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * `Sandbox.create()` calls the sandbox API and returns a Sandbox. `Sandbox.create({ manifest })` calls the
 * harness API to create a session and returns an AgentSandbox with both a sessionId and a sandboxId. The manifest
 * must name an agent (examples/harness-runtime/agent.yaml does). On either, box.<call> is the sandbox API and
 * box.agent.<call> is the harness API.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { Sandbox, UnsupportedError } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");

// Bare sandbox: sandbox API.
await using bare = await Sandbox.create();
console.log(bare.kind, bare.sandboxId, (await bare.exec("echo bare")).stdout.trim());

// Agent session: box.exec is the sandbox API on the session's sandbox, so it is the same call as above.
await using box = await Sandbox.create({ manifest });
console.log(box.kind, box.sessionId, "on sandbox", box.sandboxId);
console.log((await box.exec("uname -s")).stdout.trim());
await box.files.write("/workspace/hello.txt", "hello\n");
console.log((await box.files.readText("/workspace/hello.txt")).trim());
// box.agent.<call> is the harness API.
console.log((await box.agent.exec("uname -s")).stdout.trim());

// Each kind blocks what belongs to the other.
try {
    void bare.agent; // session operations need an agent session
} catch (err) {
    if (err instanceof UnsupportedError) console.log("bare.agent ->", err.constructor.name);
}
