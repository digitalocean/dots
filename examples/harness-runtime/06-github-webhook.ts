/**
 * Run an agent whenever GitHub sends a webhook, for example on each pull request.
 *
 *   DIGITALOCEAN_TOKEN=... KEEP=1 npx tsx examples/harness-runtime/06-github-webhook.ts
 *
 * Prints the payload URL and the signing secret to paste into the repository's
 * Settings > Webhooks. The secret is shown only once. Without KEEP=1 the trigger
 * is deleted again, so the example leaves nothing behind.
 */
import { readFileSync } from "node:fs";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime({ baseUrl: process.env.DIGITALOCEAN_API_URL });

const { trigger, setup } = await hr.triggers.webhook({
    name: `pr-review-${Date.now().toString(36)}`,
    provider: "github",
    manifest: readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent.yaml", import.meta.url), "utf8"),
    prompt: "A GitHub event arrived. Review the change it describes and list the three biggest risks.",
    output: process.env.SLACK_WEBHOOK_URL ? { slack: process.env.SLACK_WEBHOOK_URL } : undefined,
});

console.log(setup.text);
if (process.env.KEEP !== "1") {
    await trigger.delete();
    console.log("\ndeleted the trigger (set KEEP=1 to keep it)");
}
