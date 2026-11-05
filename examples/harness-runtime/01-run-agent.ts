/**
 * Run an agent and stream its answer.
 *
 *   DIGITALOCEAN_TOKEN=... npx tsx examples/harness-runtime/01-run-agent.ts "your prompt"
 *
 * Optional: HARNESS_MANIFEST=path/to/agent.yaml, DIGITALOCEAN_API_URL=<endpoint>.
 * Downstream code imports from "@digitalocean/dots/harness-runtime" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime({ baseUrl: process.env.DIGITALOCEAN_API_URL });
const manifest = readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent.yaml", import.meta.url), "utf8");
const prompt = process.argv[2] ?? "List the files in /workspace and say which tools this machine has installed.";

const session = await hr.sessions.create({ manifest });
console.error(`session ${session.id} is ready\n`);
try {
    const result = await session.run(prompt, { onText: (text) => process.stdout.write(text) });
    console.log(`\n\n${result.status}: ${result.usage?.tokensIn ?? 0} tokens in, ${result.usage?.tokensOut ?? 0} out`);
    if (result.error) console.log(`error ${result.error.code}: ${result.error.message}`);
} finally {
    await session.destroy();
}
