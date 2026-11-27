/**
 * Sandbox.create({ agent: new Agent(...) }) and box.agent: describe the agent, then drive it through its own handle.
 *
 *   npx tsx examples/agentSandbox/11-agent-option.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the agent's answer stream, its recent events, and a cancel on an idle session.
 * This starts the agent, which uses inference.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Agent, Sandbox } from "../../src/dots/sandbox/index.js";

// `agent` replaces a manifest file: the SDK builds the manifest from the Agent and creates the session
// through the harness API. It must name an agent. Pass `agent` or `manifest`, not both (see 01-create.ts).
await using box = await Sandbox.create({
    agent: new Agent("opencode", {
        model: "anthropic-claude-5.5-haiku", // sent as HARNESS_INFERENCE_MODEL
        env: { LOG_LEVEL: "info" }, // for the agent and its sandbox
        // secrets: { GITHUB_TOKEN: process.env.GITHUB_TOKEN! }, // not logged, not in the saved config
        permissions: { default: "allow", rules: [{ tool: "bash", action: "ask" }] }, // shell commands need approval
    }),
});
// The plain object does the same: agent: { harness: "opencode", model: "..." }.
console.log(`${box.kind} ${box.sessionId} on sandbox ${box.sandboxId}`);

// box.agent is the agent and nothing else. The sandbox calls stay on box and do not wait for a run:
// box.exec, box.files, box.pause, box.kill (the sandbox API). box.agent is the harness API.
const agent = box.agent;

// run sends a prompt and resolves when the turn ends. onApproval answers the shell-command requests the
// permissions above create. See 10-approvals.ts for the terminal and policy versions.
const result = await agent.run("Print the kernel version with the shell, then say what it is.", {
    onText: (text) => process.stdout.write(text),
    onApproval: (request) => request.approve(),
});
console.log(`\n${result.status}, ${result.usage?.tokensIn ?? 0} tokens in`);

// history is a finished replay of recent events, oldest first. truncated says the server served less than
// it was asked for. Pass { from: eventId } to resume after an event.
const { events, truncated } = await agent.history();
console.log(`${events.length} events (truncated: ${truncated}); last: ${events.at(-1)?.type}`);

// send returns the run id without waiting, and cancel stops the current turn or the given run:
//   "acked"       the agent stopped the turn
//   "no_turn"     nothing was running
//   "unsupported" this agent cannot be interrupted
const runId = await agent.send("Count slowly to 100, one number per line.");
console.log(`sent ${runId}`);
console.log("cancel:", await agent.cancel(runId));

// events() is the live stream, and resolveApproval(id, outcome) answers a request from any process.
// Both are shown in 05-run-send-events.ts and 10-approvals.ts.
// box.run, box.send and box.events do the same as agent.run, agent.send and agent.events.
