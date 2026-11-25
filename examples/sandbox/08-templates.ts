/**
 * Templates: list yours, and optionally build one from an OCI image.
 *
 *   npx tsx examples/sandbox/08-templates.ts
 *   TEMPLATE_IMAGE=registry.digitalocean.com/<team>/<image>:<tag> npx tsx examples/sandbox/08-templates.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * Without TEMPLATE_IMAGE you see your templates (only your own; built-in ones such as
 * coding-base are not listed) and a hint. With it, the script builds a template, runs one
 * command in a sandbox made from it, then deletes the sandbox and the template.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Sandbox, Template } from "../../src/dots/sandbox/index.js";

let count = 0;
for await (const t of Template.list()) {
    count++;
    console.log(`${t.templateId}  ${t.name}  ${t.status}`);
}
if (count === 0) console.log("no templates of your own yet");

const image = process.env.TEMPLATE_IMAGE;
if (!image) {
    console.log("\nTo build a template, set TEMPLATE_IMAGE to an OCI image reference and run again, for example:");
    console.log("  TEMPLATE_IMAGE=registry.digitalocean.com/<team>/<image>:<tag> npx tsx examples/sandbox/08-templates.ts");
    process.exit(0);
}

const name = `example-${Date.now().toString(36)}`;
const template = await Template.create({ name, sourceOciRef: image });
console.log(`\ncreated template ${template.templateId} (${template.name}), building`);
let sandbox: Sandbox | undefined;
const cleanup = async () => {
    // Delete the sandbox first, then the template it came from.
    if (sandbox) await sandbox.kill().catch((e) => console.error("could not delete sandbox:", e.message));
    await template.delete().catch((e) => console.error("could not delete template:", e.message));
};
process.once("SIGINT", () => void cleanup().finally(() => process.exit(130)));
try {
    await template.waitUntilReady({ timeoutMs: 15 * 60_000 }); // the build is asynchronous
    console.log(`template ready: ${template.status}`);
    sandbox = await Sandbox.create({ template: template.name });
    const result = await sandbox.exec("cat /etc/os-release | head -n 2", { check: true });
    console.log(result.stdout.trim());
} finally {
    await cleanup();
    console.log("deleted the sandbox and the template");
}
