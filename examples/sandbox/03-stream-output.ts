/**
 * Read output while a command runs: a callback, then the event stream.
 *
 *   npx tsx examples/sandbox/03-stream-output.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see "tick 1" to "tick 3" arrive one second apart, then the events
 * started, stdout, stderr and exit printed one per line.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Sandbox } from "../../src/dots/sandbox/index.js";

await using sbx = await Sandbox.create();
process.once("SIGINT", () => void sbx.kill().finally(() => process.exit(130)));

// 1. onStdout runs for each chunk as it arrives. The result still holds all of it at the end.
console.log("--- onStdout callback");
const loop = 'for i in 1 2 3; do echo "tick $i"; sleep 1; done';
const result = await sbx.exec(loop, { onStdout: (text) => process.stdout.write(`[live] ${text}`) });
console.log(`done, exit ${result.exitCode}, ${result.stdout.split("\n").filter(Boolean).length} lines collected`);

// 2. exec.start gives a session. Iterate it to see every event: started, stdout, stderr, exit.
console.log("--- event stream");
const session = await sbx.exec.start(["bash", "-c", "echo to-stdout; echo to-stderr >&2; sleep 1; echo more"]);
for await (const event of session) {
    if (event.type === "started") console.log(`started   exec id ${event.execId}`);
    else if (event.type === "stdout") console.log(`stdout    ${JSON.stringify(event.text)}`);
    else if (event.type === "stderr") console.log(`stderr    ${JSON.stringify(event.text)}`);
    else console.log(`exit      code ${event.exitCode} after ${event.durationMs} ms`);
}
