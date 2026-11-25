/**
 * Send input to a command: an interactive session, then the one-line form.
 *
 *   npx tsx examples/sandbox/04-stdin.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the two lines echoed back by cat, then "3" for the wc -l demo.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { Sandbox } from "../../src/dots/sandbox/index.js";

await using sbx = await Sandbox.create();
process.once("SIGINT", () => void sbx.kill().finally(() => process.exit(130)));

// 1. Start `cat` with stdin open, write two lines, close stdin so cat sees end of input, wait for it.
const session = await sbx.exec.start(["cat"]);
await session.writeStdin("first line\n");
await session.writeStdin("second line\n");
await session.closeStdin();
const result = await session.wait();
console.log("cat printed:");
console.log(result.stdout.trimEnd());

// 2. For a single input, pass stdin to exec. It is sent, then closed.
const count = await sbx.exec("wc -l", { stdin: "a\nb\nc\n" });
console.log(`wc -l counted: ${count.stdout.trim()}`);
