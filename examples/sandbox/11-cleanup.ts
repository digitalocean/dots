/**
 * Find and delete old sandboxes.
 *
 *   npx tsx examples/sandbox/11-cleanup.ts                  # dry run: only lists
 *   DELETE=1 npx tsx examples/sandbox/11-cleanup.ts         # deletes what it lists
 *   MAX_AGE_HOURS=24 npx tsx examples/sandbox/11-cleanup.ts # change the age limit (default 1)
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see each sandbox older than the limit with its age, then a count.
 * It lists every sandbox of the account, so check the list before you set DELETE=1.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Sandbox } from "../../src/dots/sandbox/index.js";

const maxAgeHours = Number(process.env.MAX_AGE_HOURS ?? "1");
if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0) throw new Error("MAX_AGE_HOURS must be a number of hours");
const reallyDelete = process.env.DELETE === "1";
const cutoff = Date.now() - maxAgeHours * 3_600_000;

let old = 0;
let deleted = 0;
for await (const sbx of Sandbox.list()) {
    const created = sbx.info.createdAt;
    if (!created || created.getTime() > cutoff) continue;
    old++;
    const ageHours = ((Date.now() - created.getTime()) / 3_600_000).toFixed(1);
    console.log(`${sbx.sandboxId}  ${sbx.state}  ${ageHours} h old`);
    if (reallyDelete && (await sbx.kill())) deleted++;
}
console.log(`${old} sandboxes older than ${maxAgeHours} h`);
console.log(reallyDelete ? `deleted ${deleted}` : "dry run: nothing deleted. Set DELETE=1 to delete them.");
