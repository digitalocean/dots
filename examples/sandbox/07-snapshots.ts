/**
 * Snapshot a sandbox: create, wait until ready, get, list, delete.
 *
 *   npx tsx examples/sandbox/07-snapshots.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the snapshot go from SNAPSHOT_STATE_CREATING to SNAPSHOT_STATE_COMPLETE, then be deleted.
 * Snapshot.list is not available on the internal test API yet; the script says so and goes on.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { NotFoundError, Sandbox, Snapshot } from "../../src/dots/sandbox/index.js";

await using sbx = await Sandbox.create();
process.once("SIGINT", () => void sbx.kill().finally(() => process.exit(130)));
await sbx.exec("echo 'state to keep' > /tmp/marker.txt", { check: true });

// Names are 1 to 63 characters: lowercase letters, digits, hyphens. Make it unique.
const name = `example-${Date.now().toString(36)}`;
const snapshot = await sbx.createSnapshot({ name, ttl: "1h" }); // ttl is optional
let snapshotId: string | undefined = snapshot.snapshotId;
process.once("SIGINT", () => void Snapshot.delete(snapshot.snapshotId).finally(() => process.exit(130)));
try {
    console.log(`created   ${snapshot.snapshotId}  state ${snapshot.state}`);
    await snapshot.waitUntilReady(); // polls until complete, throws if it fails
    console.log(`ready     state ${snapshot.state}, size ${snapshot.info.sizeBytes ?? "unknown"} bytes`);

    const fetched = await Snapshot.get(snapshot.snapshotId);
    console.log(`get       name ${fetched.name}, state ${fetched.state}`);

    try {
        let mine = false;
        for await (const s of Snapshot.list({ sandboxId: sbx.sandboxId })) mine ||= s.snapshotId === snapshot.snapshotId;
        console.log(`list      found in list: ${mine}`);
    } catch (err) {
        if (!(err instanceof NotFoundError)) throw err;
        console.log("list      Snapshot.list is not available yet");
    }
} finally {
    if (snapshotId) console.log(`delete    deleted: ${await Snapshot.delete(snapshotId)}`);
    snapshotId = undefined;
}
