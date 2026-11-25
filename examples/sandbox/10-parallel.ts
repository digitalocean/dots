/**
 * Run several sandboxes at the same time.
 *
 *   npx tsx examples/sandbox/10-parallel.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see three lines, one per sandbox, and a total time close to one sandbox's time.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Sandbox } from "../../src/dots/sandbox/index.js";

const COUNT = 3;
const created: Sandbox[] = [];
const killAll = () => Promise.allSettled(created.map((s) => s.kill()));
process.once("SIGINT", () => void killAll().finally(() => process.exit(130)));

const started = Date.now();
try {
    // Each task creates its own sandbox, runs a command and returns a line of text.
    const lines = await Promise.all(
        Array.from({ length: COUNT }, async (_, i) => {
            const sbx = await Sandbox.create();
            created.push(sbx); // remembered so the finally block can delete it
            const result = await sbx.exec(`echo "worker ${i} on $(hostname)"`, { check: true });
            return `${sbx.sandboxId}: ${result.stdout.trim()}`;
        }),
    );
    for (const line of lines) console.log(line);
    console.log(`${COUNT} sandboxes in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} finally {
    await killAll();
    console.log(`deleted ${created.length} sandboxes`);
}
