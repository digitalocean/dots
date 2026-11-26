/**
 * box.exec: run a command in the agent session's sandbox (harness API). Same options and result as a bare
 * sandbox's exec.
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

// A string runs as `sh -c <command>` (the harness API's shell; a bare sandbox uses bash -lc).
// The result is returned: a non-zero exit is not thrown.
const hello = await box.exec("echo hello; echo oops >&2; exit 3");
console.log(hello.stdout.trim(), "|", hello.stderr.trim());
console.log(`exitCode ${hello.exitCode}, ok ${hello.ok}, ${hello.durationMs} ms, truncated ${hello.truncated}`);

// An array runs as given, with no shell.
console.log((await box.exec(["python3", "--version"])).stdout.trim());

// cwd (defaults to /workspace), env (this command only) and timeout (seconds, or "90s", "10m", "2h").
const opts = await box.exec('pwd; echo "CI=$CI"', { cwd: "/tmp", env: { CI: "1" }, timeout: "30s" });
console.log(opts.stdout.trim());

// envVars and timeoutSeconds are the longer spellings. Pass one of each pair, not both.
console.log((await box.exec("echo $A", { envVars: { A: "1" }, timeoutSeconds: 10 })).stdout.trim());

// stdin is sent in full, then closed. For live stdin see 06-spawn.ts.
console.log((await box.exec("wc -l", { stdin: "a\nb\nc\n" })).stdout.trim());

// Streaming: pass onStdout or onStderr and the call streams while the command runs.
await box.exec("for i in 1 2 3; do echo tick $i; sleep 1; done", {
    onStdout: (text) => process.stdout.write(`[live] ${text}`),
});

// signal aborts the stream, and the server then cancels the command.
const stop = new AbortController();
setTimeout(() => stop.abort(), 1500);
await box.exec("sleep 30", { signal: stop.signal }).catch((err) => console.log(`aborted: ${err.name}`));

// check: true throws a CommandError on a non-zero exit. The result is on err.result.
try {
    await box.exec("exit 2", { check: true });
} catch (err) {
    if (!(err instanceof CommandError)) throw err;
    console.log(`CommandError: ${err.message}; exitCode ${(err.result as { exitCode: number }).exitCode}`);
}

// Limits: without a callback or signal the call has 240 s and keeps 1 MiB per stream (`truncated` says so).
// A streamed call has 15 minutes and keeps all of its output.
// There is no PTY (exec.start) on an agent session. See 06-spawn.ts for live stdin.
