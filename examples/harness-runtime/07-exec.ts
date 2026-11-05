/**
 * Run a command in a session.
 *
 *   DIGITALOCEAN_TOKEN=... npx tsx examples/harness-runtime/07-exec.ts
 *
 * Downstream code imports from "@digitalocean/dots/harness-runtime" instead of the relative path.
 */
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime();

// Create a session. harness: "sandbox" gives one with no agent installed;
// a session with an agent (for example "opencode") runs commands the same way.
const session = await hr.sessions.create({ manifest: { harness: "sandbox" } });

// Run a command and read its output.
const { stdout } = await session.exec(["echo", "Hello from DigitalOcean!"]);
console.log(stdout);

// Destroy the session.
await session.destroy();
