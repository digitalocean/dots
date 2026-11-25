/**
 * The life of a sandbox: create, list, get, pause, resume, connect, delete.
 *
 *   npx tsx examples/sandbox/05-lifecycle.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the state at each step: RUNNING, PAUSED, RUNNING, then the sandbox gone.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { NotFoundError, Sandbox } from "../../src/dots/sandbox/index.js";

await using sbx = await Sandbox.create();
process.once("SIGINT", () => void sbx.kill().finally(() => process.exit(130)));
const id = sbx.sandboxId;
console.log(`created   ${id}  state ${sbx.state}`);

// list() walks every page. Find the sandbox we just made.
let found = false;
for await (const item of Sandbox.list()) {
    if (item.sandboxId === id) found = true;
}
console.log(`listed    found in list: ${found}`);

// get() fetches by id and does not change the state.
const fetched = await Sandbox.get(id);
console.log(`get       state ${fetched.state}, template ${fetched.template}`);

await sbx.pause();
console.log(`paused    state ${(await sbx.getInfo()).state}, isRunning ${await sbx.isRunning()}`);

await sbx.resume();
console.log(`resumed   state ${(await sbx.getInfo()).state}, isRunning ${await sbx.isRunning()}`);

// pause it again, then connect() by id: it resumes a paused sandbox for you.
await sbx.pause();
const again = await Sandbox.connect(id);
console.log(`connect   state ${again.state} (it was paused)`);

console.log(`kill      deleted: ${await sbx.kill()}`);
try {
    await Sandbox.get(id);
    console.log("get       still there");
} catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    console.log("get       NotFoundError, the sandbox is gone");
}
