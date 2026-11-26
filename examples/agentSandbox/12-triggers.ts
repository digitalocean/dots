/**
 * Triggers: run an agent on a schedule or from a webhook.
 *
 *   OPENAI_API_KEY=... npx tsx examples/agentSandbox/12-triggers.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address) and OPENAI_API_KEY.
 * You should see a cron trigger on a fresh session, a webhook trigger with its one-time secret, and a cron
 * trigger bound to an existing session. It creates three triggers and deletes them at the end.
 * Nothing runs until a trigger fires; the cron here is hourly.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Agent, Sandbox } from "../../src/dots/sandbox/index.js";

const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error("Set OPENAI_API_KEY: a trigger's sessions get no managed inference key, so the agent brings its own.");

// A fresh session per run. The agent comes from `agent` (or a full `manifest`).
const hourly = await Sandbox.trigger({
    name: `dots-hourly-${Date.now()}`,
    prompt: "Summarise what changed in /workspace since the last run.",
    cron: "0 * * * *",
    timezone: "UTC", // the default
    agent: new Agent("opencode", { secrets: { OPENAI_API_KEY: key } }),
});
console.log(`cron trigger ${hourly.id}, next run ${hourly.nextRunAt?.toISOString()}`);

// A webhook returns the handle and the setup steps. The secret is shown only once, so store it now.
const { trigger: hook, setup } = await Sandbox.trigger({
    name: `dots-hook-${Date.now()}`,
    prompt: "Review this event and say what to do: {{payload}}",
    webhook: "custom", // or "github", "gitlab"
    agent: new Agent("opencode", { secrets: { OPENAI_API_KEY: key } }),
});
console.log(`webhook ${setup.url}, secret ${setup.secret}`);
console.log(setup.text);

// Bound to an existing session: each run resumes it, so the agent keeps its files and history.
// `pause: true` pauses the session first, because a bound session must be paused when a run fires.
await using box = await Sandbox.create({ agent: new Agent("opencode", { secrets: { OPENAI_API_KEY: key } }), manageModelAccessKey: false });
const bound = await box.trigger({ name: `dots-bound-${Date.now()}`, prompt: "Continue the notes in /workspace/notes.md", cron: "0 9 * * 1-5", pause: true });
console.log(`bound trigger ${bound.id} on session ${box.sessionId}`);

// The handles are the harness TriggerHandle: executions(), pause(), resume(), rotateSecret(), delete().
for (const t of [hourly, hook, bound]) await t.delete();
console.log("deleted");
