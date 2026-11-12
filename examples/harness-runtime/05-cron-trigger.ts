/**
 * Run an agent on a schedule and look at its recent runs.
 *
 *   DIGITALOCEAN_ACCESS_TOKEN=... npx tsx examples/harness-runtime/05-cron-trigger.ts
 *   DIGITALOCEAN_ACCESS_TOKEN=... TRIGGER_ID=<id> npx tsx examples/harness-runtime/05-cron-trigger.ts
 *
 * Without TRIGGER_ID it creates a weekday 09:00 trigger in your local time zone,
 * prints its next run, and deletes it again unless KEEP=1 is set. With
 * TRIGGER_ID it lists that trigger's recent runs. With WAIT_FOR_RUN=1 it
 * schedules the trigger every minute instead and waits for its first run. Set
 * EMAIL or SLACK_WEBHOOK_URL to have each run's result sent there.
 */
import { readFileSync } from "node:fs";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime();
// Ctrl-C stops the wait below, so the trigger is still deleted. A second Ctrl-C quits at once.
const interrupt = new AbortController();
process.once("SIGINT", () => interrupt.abort(new Error("interrupted")));
const waitForRun = process.env.WAIT_FOR_RUN === "1";
const output = process.env.EMAIL
    ? { email: process.env.EMAIL }
    : process.env.SLACK_WEBHOOK_URL
      ? { slack: process.env.SLACK_WEBHOOK_URL }
      : undefined;

// A trigger that starts a fresh session per run gets no managed inference key,
// so its manifest carries your OpenAI key as a secret (agent-trigger.yaml points
// the agent at OpenAI). JSON quoting keeps any key a valid YAML string.
const key = process.env.HARNESS_INFERENCE_API_KEY;
if (!key && !process.env.TRIGGER_ID) {
    throw new Error("set HARNESS_INFERENCE_API_KEY to your OpenAI API key: a trigger's sessions get no managed key");
}
const manifest = `${readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent-trigger.yaml", import.meta.url), "utf8")}secrets:
  OPENAI_API_KEY: ${JSON.stringify(key)}
`;

const trigger = process.env.TRIGGER_ID
    ? await hr.triggers.get(process.env.TRIGGER_ID)
    : await hr.triggers.cron({
          name: `standup-${Date.now().toString(36)}`,
          schedule: waitForRun ? "* * * * *" : "0 9 * * 1-5",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          manifest,
          prompt: "Write a three-line status note for a team standup.",
          output,
      });

console.log(`trigger ${trigger.name} (${trigger.id}), next run ${trigger.nextRunAt?.toISOString() ?? "unknown"}`);
if (waitForRun && !process.env.TRIGGER_ID) {
    // The scheduler checks once a minute, so the first run starts within about two.
    try {
        const run = await trigger.waitForRun({ timeoutMs: 10 * 60_000, signal: interrupt.signal });
        console.log(`run ${run.id}: ${run.status} ${run.failureReason ?? ""}\n${run.output ?? ""}`);
        if (run.status !== "succeeded") process.exitCode = 1;
    } catch (err) {
        if (process.env.KEEP !== "1") await trigger.delete();
        throw err;
    }
}
let shown = 0;
for await (const run of trigger.executions()) {
    console.log(`  ${run.createdAt?.toISOString() ?? "(not started)"}  ${run.status}  ${run.failureReason ?? ""}`);
    if (++shown === 10) break;
}
if (shown === 0) console.log("  no runs yet");

if (!process.env.TRIGGER_ID && process.env.KEEP !== "1") {
    await trigger.delete();
    console.log("deleted the trigger (set KEEP=1 to keep it)");
}
