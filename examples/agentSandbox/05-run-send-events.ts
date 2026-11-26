/**
 * box.run, box.send and box.events: talk to the agent in the session.
 *
 *   npx tsx examples/agentSandbox/05-run-send-events.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the agent's answer streamed, then the event types of a second, sent prompt.
 * This starts the agent, which uses inference.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { Sandbox } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");
const interrupt = new AbortController();
process.once("SIGINT", () => interrupt.abort(new Error("interrupted")));

await using box = await Sandbox.create({ manifest });

// run sends a prompt and resolves when the turn ends. onText streams the answer.
const result = await box.run("List the files in /workspace and say which tools this machine has installed.", {
    onText: (text) => process.stdout.write(text),
    signal: interrupt.signal, // stops the wait, not the run
});
console.log(`\n${result.status}: ${result.usage?.tokensIn ?? 0} tokens in, ${result.usage?.tokensOut ?? 0} out`);
if (result.error) console.log(`error ${result.error.code}: ${result.error.message}`);

// send returns the run id without waiting. events() is the live stream: it reconnects on its own, and
// leaving the loop disconnects. Attach first, then send, so no event is missed.
const stop = new AbortController();
const events = box.events({ signal: stop.signal });
const first = events.next(); // opens the stream
await new Promise((r) => setTimeout(r, 1000));
const runId = await box.send("Say hello in one short sentence.");
console.log(`sent run ${runId}`);

let event = await first;
while (!event.done) {
    console.log(`event ${event.value.type}`);
    if (event.value.type === "run.completed" || event.value.type === "run.failed") break;
    event = await events.next();
}
stop.abort();

// Approvals, checkpoints, forks and cancel are on box.session (see examples/harness-runtime).
