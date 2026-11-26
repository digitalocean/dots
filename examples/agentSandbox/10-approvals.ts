/**
 * Human in the loop: the agent asks before it runs a shell command, and you decide.
 *
 *   npx tsx examples/agentSandbox/10-approvals.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the agent's text stream, then each request it makes and your answer. Part 1 asks you on the
 * terminal (y or n). Part 2 decides from code, with no terminal, which is how a service would do it.
 * This starts the agent, which uses inference.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Sandbox } from "../../src/dots/sandbox/index.js";

// The agent from agent.yaml, plus a rule: the agent may do anything except run shell commands, which it must ask for.
const manifest = `${readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8")}
permissions:
  default: allow
  rules:
    - tool: bash
      action: ask
`;

const interrupt = new AbortController();
process.once("SIGINT", () => interrupt.abort(new Error("interrupted")));

await using box = await Sandbox.create({ manifest });

// Part 1: answer on the terminal. run() calls onApproval for each request and waits while you decide.
// Each request has approve(), reject(reason) and defer(reason). `category` is `permission`, `question` or
// `plan_approval`, `toolName` is the tool where the agent reports it, and `details` is the full request.
console.log("--- part 1: you decide ---");
const first = await box.run("Use the shell to print the kernel version and the free disk space.", {
    onText: (text) => process.stdout.write(text),
    signal: interrupt.signal,
    onApproval: async (request) => {
        const what = request.toolName ?? request.category ?? "a tool";
        const answer = await ask(`\n\nThe agent asks to use ${what}:\n${JSON.stringify(request.details, null, 2)}\nApprove? [y/N] `);
        if (answer.trim().toLowerCase() === "y") await request.approve();
        else await request.reject("declined from the terminal");
    },
});
console.log(`\n${first.status}`);

// Part 2: decide from code. send() returns the run id at once, and events() is the live stream. A request
// arrives as a `run.human_input_requested` event, and box.session.resolveApproval(id, outcome) answers it, from
// this process or any other that can read the session. Here a policy answers: allow `uname`, refuse the rest.
console.log("\n--- part 2: a policy decides ---");
const stop = new AbortController();
const events = box.events({ signal: stop.signal });
const pending = events.next(); // opens the stream before the prompt is sent, so no event is missed
await new Promise((r) => setTimeout(r, 1000));
const runId = await box.send("Use the shell to run `uname -a`, then run `ls /`, and tell me both results.");
console.log(`sent run ${runId}`);

for (let step = await pending; !step.done; step = await events.next()) {
    const event = step.value;
    if (event.runId !== runId) continue;
    if (event.type === "run.human_input_requested") {
        const body = (event.payload ?? {}) as { hitl_id?: string; payload?: { tool_name?: string; [k: string]: unknown } };
        const hitlId = String(body.hitl_id ?? "");
        const command = JSON.stringify(body.payload ?? {});
        const allowed = command.includes("uname");
        console.log(`request ${hitlId}: ${command.slice(0, 120)} -> ${allowed ? "approve" : "reject"}`);
        await box.session.resolveApproval(hitlId, allowed ? "approve" : "reject", allowed ? undefined : "not allowed by policy");
        // "defer" leaves it for someone else: box.session.resolveApproval(hitlId, "defer").
    } else if (event.type === "run.completed" || event.type === "run.failed") {
        console.log(event.type);
        break;
    }
}
stop.abort();

// Without onApproval, and with nobody resolving, a request stays pending and the run waits.
// box.session.cancel() stops a run that is stuck on one.

/** Asks one question on the terminal. */
async function ask(question: string): Promise<string> {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await terminal.question(question);
    } finally {
        terminal.close();
    }
}
