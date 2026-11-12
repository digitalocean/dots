/**
 * Approve the agent's risky steps from the terminal.
 *
 *   DIGITALOCEAN_ACCESS_TOKEN=... npx tsx examples/harness-runtime/02-approvals.ts "your prompt"
 *
 * The manifest below lets the agent do anything except run shell commands, which
 * it must ask for. Each request is shown here, and you answer y or n.
 */
import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

// The agent from agent.yaml, plus a rule: shell commands need your approval.
const manifest = `${readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent.yaml", import.meta.url), "utf8")}
permissions:
  default: allow
  rules:
    - tool: bash
      action: ask
`;

const hr = new HarnessRuntime();
// Ctrl-C stops the wait below, so the cleanup still runs. A second Ctrl-C quits at once.
const interrupt = new AbortController();
process.once("SIGINT", () => interrupt.abort(new Error("interrupted")));
const prompt = process.argv[2] ?? "Use the shell to print the kernel version and the free disk space.";

await using session = await hr.sessions.create({ manifest }); // destroyed when the script ends
const result = await session.run(prompt, {
    onText: (text) => process.stdout.write(text),
    signal: interrupt.signal,
    onApproval: async (request) => {
        const what = request.toolName ?? request.category ?? "a tool";
        const answer = await ask(
            `\n\nThe agent asks to use ${what}:\n${JSON.stringify(request.details, null, 2)}\nApprove? [y/N] `,
        );
        if (answer.trim().toLowerCase() === "y") await request.approve();
        else await request.reject("declined from the terminal");
    },
});
console.log(`\n\n${result.status}`);

/** Asks one question on the terminal. */
async function ask(question: string): Promise<string> {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await terminal.question(question);
    } finally {
        terminal.close();
    }
}
