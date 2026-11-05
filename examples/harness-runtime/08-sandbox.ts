/**
 * A sandbox with no agent: create it, run commands, stream output, throw it away.
 *
 *   DIGITALOCEAN_TOKEN=... npx tsx examples/harness-runtime/08-sandbox.ts
 *
 * Optional: DIGITALOCEAN_API_URL=<endpoint>.
 * Downstream code imports from "@digitalocean/dots/harness-runtime" instead of the relative path.
 */
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime({ baseUrl: process.env.DIGITALOCEAN_API_URL });

const sandbox = await hr.sandboxes.create();
try {
    const { stdout } = await sandbox.exec(["echo", "Hello from DigitalOcean!"]);
    console.log(stdout);

    // Output streams while the command runs. Streaming is not in the published
    // API spec yet; see "Preview" in this folder's README.
    await sandbox.exec("for i in 1 2 3; do echo tick $i; sleep 1; done", {
        onStdout: (text) => process.stdout.write(text),
    });
} finally {
    await sandbox.destroy();
}
