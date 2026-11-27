/**
 * The Agent Sandbox spec's shape: Agent, Permissions, Bash, Secret-free egress, `box.agent.run`, `execStream`.
 *
 *   OPENAI_API_KEY=... npx tsx examples/agentSandbox/13-spec-surface.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address) and OPENAI_API_KEY.
 * You should see the agent's answer streamed, the streamed output of a command, and the git diff.
 * This starts the agent, which uses inference. `image: Image.coding()` is the default environment.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Agent, Bash, Image, Permissions, Sandbox } from "../../src/dots/sandbox/index.js";

const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error("Set OPENAI_API_KEY");

await using sbx = await Sandbox.create({
    image: Image.coding(),
    egress: ["github.com", "api.openai.com"], // once set, every other host is blocked
    agent: new Agent("opencode", {
        secrets: { OPENAI_API_KEY: key },
        // allow, ask, then deny: a deny always wins
        permissions: new Permissions({ default: "ask", allow: [Bash("git *"), "file.read"], deny: [Bash("rm -rf *")] }),
    }),
});

// The agent is a property: sbx.agent.run, sbx.agent.events, sbx.agent.approve(id). Calling sbx.agent() gives the same handle.
await sbx.exec("git init /workspace/app", { check: true });
await sbx.agent.run("Create a file hello.txt in /workspace/app with one line of text, then run git status.", {
    onText: (t) => process.stdout.write(t),
    onApproval: (req) => (req.tool === "bash" ? req.approve() : req.reject("not allowed")), // `tool` is the tool the agent wants
});

// Streamed output of a command, then the same result exec returns.
const build = sbx.execStream("git status && git log --oneline | head -5", { cwd: "/workspace/app" });
for await (const chunk of build) process.stdout.write(`[${chunk.stream}] ${chunk.text}`);
console.log("exit", build.result?.exitCode, "ok", build.result?.ok);
