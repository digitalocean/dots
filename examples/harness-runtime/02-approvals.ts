/**
 * Approve the agent's risky steps from the terminal.
 *
 *   DIGITALOCEAN_TOKEN=... npx tsx examples/harness-runtime/02-approvals.ts "your prompt"
 *
 * The manifest below lets the agent do anything except run shell commands, which
 * it must ask for. Each request is shown here, and you answer y or n.
 */
import { createInterface } from "node:readline/promises";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const manifest = `
harness: opencode
permissions:
  default: allow
  rules:
    - tool: bash
      action: ask
`;

const hr = new HarnessRuntime({ baseUrl: process.env.DIGITALOCEAN_API_URL });
const prompt = process.argv[2] ?? "Use the shell to print the kernel version and the free disk space.";

const session = await hr.sessions.create({ manifest });
try {
    const result = await session.run(prompt, {
        onText: (text) => process.stdout.write(text),
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
} finally {
    await session.destroy();
}

/** Asks one question on the terminal. */
async function ask(question: string): Promise<string> {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await terminal.question(question);
    } finally {
        terminal.close();
    }
}
