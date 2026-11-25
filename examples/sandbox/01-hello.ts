/**
 * Hello sandbox: create one, run two commands, delete it.
 *
 *   npx tsx examples/sandbox/01-hello.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the echo text, the kernel line, "exit code: 0" and "ok: true".
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Sandbox } from "../../src/dots/sandbox/index.js";

// create() returns once the sandbox is running. `await using` deletes it when the script ends,
// even when something throws (TypeScript 5.2 or later).
await using sbx = await Sandbox.create();
console.log(`sandbox ${sbx.sandboxId} is ${sbx.state}`);
// Ctrl-C: delete the sandbox, then quit.
process.once("SIGINT", () => void sbx.kill().finally(() => process.exit(130)));

const hello = await sbx.exec("echo 'Hello from a sandbox'");
console.log(hello.stdout.trim());

const uname = await sbx.exec("uname -a");
console.log(uname.stdout.trim());
console.log(`exit code: ${uname.exitCode}`);
console.log(`ok: ${uname.ok}`);
