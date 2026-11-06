/**
 * Run an agent whenever another system calls a webhook.
 *
 *   DIGITALOCEAN_ACCESS_TOKEN=... npx tsx examples/harness-runtime/06-webhook.ts
 *
 * Creates a custom webhook trigger and prints its URL and signing secret (shown
 * only once). With WAIT_FOR_RUN=1 it then calls the webhook itself, signed the
 * way any system must sign it, and waits for the agent's run. Set EMAIL or
 * SLACK_WEBHOOK_URL to have the result sent there. Unless KEEP=1 is set, the
 * trigger is deleted at the end.
 *
 * For GitHub or GitLab, pass provider "github" or "gitlab" instead: the setup
 * steps then say where the secret goes in that product.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime();
// Ctrl-C stops the wait below, so the trigger is still deleted. A second Ctrl-C quits at once.
const interrupt = new AbortController();
process.once("SIGINT", () => interrupt.abort(new Error("interrupted")));
const output = process.env.EMAIL
    ? { email: process.env.EMAIL }
    : process.env.SLACK_WEBHOOK_URL
      ? { slack: process.env.SLACK_WEBHOOK_URL }
      : undefined;

// A trigger that starts a fresh session per run gets no managed inference key,
// so its manifest carries your OpenAI key as a secret (agent-trigger.yaml points
// the agent at OpenAI). JSON quoting keeps any key a valid YAML string.
const key = process.env.HARNESS_INFERENCE_API_KEY;
if (!key) {
    throw new Error("set HARNESS_INFERENCE_API_KEY to your OpenAI API key: a trigger's sessions get no managed key");
}
const manifest = `${readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent-trigger.yaml", import.meta.url), "utf8")}secrets:
  OPENAI_API_KEY: ${JSON.stringify(key)}
`;

const { trigger, setup } = await hr.triggers.webhook({
    name: `webhook-${Date.now().toString(36)}`,
    provider: "custom",
    manifest,
    prompt: "An event arrived. Summarise what it describes in two sentences.",
    output,
});
console.log(setup.text);

try {
    if (process.env.WAIT_FOR_RUN === "1") {
        // Sign "{unix time}.{raw body}" with the trigger's secret: X-DigitalOcean-Signature: t=<unix>,v1=<hex>.
        const body = JSON.stringify({ event: "deploy.finished", service: "checkout", version: "1.4.2", ok: true });
        const t = Math.floor(Date.now() / 1000);
        const v1 = createHmac("sha256", setup.secret).update(`${t}.${body}`).digest("hex");
        const res = await fetch(setup.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-DigitalOcean-Signature": `t=${t},v1=${v1}` },
            body,
        });
        console.log(`\ncalled the webhook: HTTP ${res.status}`);
        if (!res.ok) throw new Error(`the webhook refused the delivery: ${await res.text()}`);

        const run = await trigger.waitForRun({ timeoutMs: 10 * 60_000, signal: interrupt.signal });
        console.log(`run ${run.id}: ${run.status} ${run.failureReason ?? ""}\n${run.output ?? ""}`);
        if (run.status !== "succeeded") process.exitCode = 1;
    }
} finally {
    if (process.env.KEEP !== "1") {
        await trigger.delete();
        console.log("\ndeleted the trigger (set KEEP=1 to keep it)");
    }
}
