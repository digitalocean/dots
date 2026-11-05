/**
 * Run commands in the agent's sandbox yourself: look around, hand the agent a
 * bug, then check its fix with a command instead of taking its word for it.
 *
 *   DIGITALOCEAN_TOKEN=... npx tsx examples/harness-runtime/08-verify-agent-fix.ts
 *
 * Optional: HARNESS_MANIFEST=path/to/agent.yaml, DIGITALOCEAN_API_URL=<endpoint>.
 * Downstream code imports from "@digitalocean/dots/harness-runtime" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime({ baseUrl: process.env.DIGITALOCEAN_API_URL });
const manifest = readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent.yaml", import.meta.url), "utf8");

const session = await hr.sessions.create({ manifest });
console.error(`session ${session.id} is ready\n`);
try {
    // A string runs through `sh -c`, so pipes and globs work.
    console.log((await session.exec("uname -sr && ls /workspace | wc -l")).stdout);

    // A broken script, and the check it has to pass. An array runs as given, with no shell.
    await session.files.upload("add.sh", 'echo $(( $1 - $2 ))\n');
    const check = () => session.exec(["sh", "add.sh", "2", "3"], { cwd: "/workspace" });
    console.log(`before: add.sh 2 3 = ${(await check()).stdout.trim()}`);

    await session.run("/workspace/add.sh should print the sum of its two arguments. Fix it.", {
        onText: (text) => process.stdout.write(text),
    });

    const after = await check();
    console.log(`\nafter:  add.sh 2 3 = ${after.stdout.trim()}`);
    console.log(after.exitCode === 0 && after.stdout.trim() === "5" ? "fixed" : `still broken:\n${after.stderr}`);
} finally {
    await session.destroy();
}
