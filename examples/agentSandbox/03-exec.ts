/**
 * box.exec: run a command in the agent session's sandbox. It is the sandbox API (`/v2/sandboxes/{sandboxId}/exec`),
 * the same call a bare sandbox makes. For the harness API's exec use `box.agent.exec`.
 *
 *   npx tsx examples/agentSandbox/03-exec.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the output, exit code and ok flag of each call.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { CommandError, Sandbox } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");
await using box = await Sandbox.create({ manifest });

// A string runs through bash -lc. The result is returned: a non-zero exit is not thrown.
const hello = await box.exec("echo hello; echo oops >&2; exit 3");
console.log(hello.stdout.trim(), "|", hello.stderr.trim());
console.log(`exitCode ${hello.exitCode}, ok ${hello.ok}`);

// An array runs as given, with no shell.
console.log((await box.exec(["python3", "--version"])).stdout.trim());

// cwd, env (this command only) and timeout (seconds, or "90s", "10m", "2h").
const opts = await box.exec('pwd; echo "CI=$CI"', { cwd: "/tmp", env: { CI: "1" }, timeout: "30s" });
console.log(opts.stdout.trim());

// stdin is sent in full, then closed.
console.log((await box.exec("wc -l", { stdin: "a\nb\nc\n" })).stdout.trim());

// onStdout and onStderr stream while the command runs. execStream is the same as an async iterator.
await box.exec("for i in 1 2 3; do echo tick $i; sleep 1; done", { onStdout: (text) => process.stdout.write(`[live] ${text}`) });
const stream = box.execStream("echo one; echo two");
for await (const chunk of stream) process.stdout.write(`[${chunk.stream}] ${chunk.text}`);
console.log("stream result", stream.result?.exitCode);

// check: true throws a CommandError on a non-zero exit. The result is on err.result.
try {
    await box.exec("exit 2", { check: true });
} catch (err) {
    if (!(err instanceof CommandError)) throw err;
    console.log(`CommandError: ${err.message}; exitCode ${(err.result as { exitCode: number }).exitCode}`);
}

// A PTY is the sandbox API's: box.exec.start("bash", { pty: {} }). The harness API's exec is box.agent.exec.
console.log("harness exec:", (await box.agent.exec("echo via the harness API")).stdout.trim());
