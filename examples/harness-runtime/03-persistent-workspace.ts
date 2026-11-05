/**
 * Keep files across sessions with a persistent workspace.
 *
 *   DIGITALOCEAN_TOKEN=... npx tsx examples/harness-runtime/03-persistent-workspace.ts
 *
 * The first session writes files into the workspace; the second session, created
 * after the first is gone, finds them in /workspace. The example deletes the
 * workspace and the saved environment at the end unless KEEP=1 is set.
 */
import { readFileSync } from "node:fs";
import { HarnessRuntime, NotEnabledError } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime({ baseUrl: process.env.DIGITALOCEAN_API_URL });
const manifest = readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent.yaml", import.meta.url), "utf8");
const name = `example-${Date.now().toString(36)}`;
const print = (text: string) => process.stdout.write(text);

const ws = await hr.workspaces.create({ name, sizeLimitGib: 1 }).catch((err) => {
    if (err instanceof NotEnabledError) console.error("Persistent workspaces are not enabled for this team yet.");
    throw err;
});
const env = await hr.environments.create({ name, manifest });
console.error(`workspace ${ws.id} and environment ${env.id} created\n`);

try {
    const first = await hr.sessions.create({ environment: env, workspace: ws });
    await first.files.upload("from-the-sdk.txt", "Uploaded by the SDK in the first session.\n");
    await first.run("Write a short haiku about the sea to /workspace/haiku.md.", { onText: print });
    await first.destroy();
    await hr.workspaces.waitUntilAvailable(ws.id); // the first session has released it

    const second = await hr.sessions.create({ environment: env, workspace: ws });
    console.log(`\n\nsecond session reads: ${await second.files.downloadText("from-the-sdk.txt")}`);
    await second.run("Print the contents of /workspace/haiku.md.", { onText: print });
    print("\n");
    await second.destroy();
    await hr.workspaces.waitUntilAvailable(ws.id);
} finally {
    if (process.env.KEEP !== "1") {
        await hr.workspaces.delete(ws.id).catch((err) => console.error(`could not delete workspace: ${err.message}`));
        await hr.environments.delete(env.id).catch((err) => console.error(`could not delete environment: ${err.message}`));
    }
}
