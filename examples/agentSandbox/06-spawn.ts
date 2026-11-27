/**
 * box.spawn: a background command (sandbox API). box.agent.spawn: the harness API's, with live stdin.
 * box.exec runs and waits; spawn starts one and returns while it runs.
 *
 *   npx tsx examples/agentSandbox/06-spawn.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see a server answer a request, then python reply to two lines of stdin, or a note that
 * live stdin is not enabled for your team.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { ConflictError, NotEnabledError } from "../../src/dots/harnessRuntime/index.js";
import { Sandbox } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");
await using box = await Sandbox.create({ manifest });
await box.files.makeDir("/workspace/site");
await box.files.write("/workspace/site/index.html", "<h1>hello from a background server</h1>\n");

// box.spawn is the sandbox API: it returns a Command with a pid. box.processes.list() lists them.
const server = await box.spawn("cd /workspace/site && python3 -m http.server 8080");
console.log("running", (await box.processes.list()).map((p) => p.pid).join(", "));
const page = await box.exec("for i in $(seq 20); do curl -sf localhost:8080/ && exit 0; sleep 0.5; done; exit 1");
console.log(page.ok ? page.stdout.trim() : `the server did not answer: ${page.stderr}`);
await server.kill();

// Live stdin: write while the command runs. It is enabled team by team, and needs a recent image.
// box.agent.spawn is the harness API's. The sandbox API's live stdin is box.exec.start(cmd, { keepStdinOpen: true }).
try {
    const py = await box.agent.spawn(["python3", "-i"], { stdin: true, onStdout: (t) => process.stdout.write(t) });
    await py.write("print(1 + 1)\n");
    await py.write("print('done')\n");
    await py.closeStdin();
    console.log("exit code", (await py.wait()).exitCode);
} catch (err) {
    if (err instanceof NotEnabledError) console.log("live stdin is not enabled for this team yet");
    else if (err instanceof ConflictError) console.log("this sandbox's image is too old for live stdin");
    else throw err;
}
