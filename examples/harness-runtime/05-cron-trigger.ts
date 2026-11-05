/**
 * Run an agent on a schedule and look at its recent runs.
 *
 *   DIGITALOCEAN_TOKEN=... npx tsx examples/harness-runtime/05-cron-trigger.ts
 *   DIGITALOCEAN_TOKEN=... TRIGGER_ID=<id> npx tsx examples/harness-runtime/05-cron-trigger.ts
 *
 * Without TRIGGER_ID it creates a weekday 09:00 trigger in your local time zone,
 * prints its next run, and deletes it again unless KEEP=1 is set. With
 * TRIGGER_ID it lists that trigger's recent runs. Set SLACK_WEBHOOK_URL to have
 * each run's result posted to Slack.
 */
import { readFileSync } from "node:fs";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime({ baseUrl: process.env.DIGITALOCEAN_API_URL });

const trigger = process.env.TRIGGER_ID
    ? await hr.triggers.get(process.env.TRIGGER_ID)
    : await hr.triggers.cron({
          name: `standup-${Date.now().toString(36)}`,
          schedule: "0 9 * * 1-5",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          manifest: readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent.yaml", import.meta.url), "utf8"),
          prompt: "Write a three-line status note for a team standup.",
          output: process.env.SLACK_WEBHOOK_URL ? { slack: process.env.SLACK_WEBHOOK_URL } : undefined,
      });

console.log(`trigger ${trigger.name} (${trigger.id}), next run ${trigger.nextRunAt?.toISOString() ?? "unknown"}`);
let shown = 0;
for await (const run of trigger.executions()) {
    console.log(`  ${run.createdAt?.toISOString()}  ${run.status}  ${run.failureReason ?? ""}`);
    if (++shown === 10) break;
}
if (shown === 0) console.log("  no runs yet");

if (!process.env.TRIGGER_ID && process.env.KEEP !== "1") {
    await trigger.delete();
    console.log("deleted the trigger (set KEEP=1 to keep it)");
}
