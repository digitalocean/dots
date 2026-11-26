/**
 * SandboxClient: bind the token and API address once, then create bare sandboxes and agent sessions.
 *
 *   npx tsx examples/agentSandbox/09-client.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see one bare sandbox and one agent session, each with the call its kind uses.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { SandboxClient } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");

const client = new SandboxClient({ token: process.env.DIGITALOCEAN_ACCESS_TOKEN, apiUrl: process.env.DIGITALOCEAN_API_URL });

// No manifest: the sandbox API, a bare Sandbox.
await using bare = await client.Sandbox.create();
console.log(`${bare.kind} ${bare.sandboxId}: ${(await bare.exec("echo bare")).stdout.trim()}`);

// With a manifest: the harness API, an AgentSandbox. getSession fetches it again by id.
await using box = await client.Sandbox.create({ manifest });
console.log(`${box.kind} ${box.sessionId}: ${(await box.exec("echo agent")).stdout.trim()}`);
const again = await client.Sandbox.getSession(box.sessionId);
console.log(`getSession ${again.sessionId} ${again.status}`);
