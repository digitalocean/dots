/**
 * The options of sandbox.exec: cwd, env, timeout, argv vs shell, failures, check.
 *
 *   npx tsx examples/sandbox/02-exec-options.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see /tmp, the env value, a finished command and an exceeded timeout, a failed command with ok false,
 * and a CommandError caught with its exit code.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { CommandError, Sandbox, SandboxError } from "../../src/dots/sandbox/index.js";

await using sbx = await Sandbox.create();
process.once("SIGINT", () => void sbx.kill().finally(() => process.exit(130)));

// cwd and env
const where = await sbx.exec("pwd && echo $GREETING", { cwd: "/tmp", env: { GREETING: "hi from env" } });
console.log("cwd and env:", where.stdout.trim().replace("\n", " | "));

// A string runs as `bash -lc <string>`, so pipes and && work. An array runs the program
// directly with no shell: arguments are not split or expanded.
const shell = await sbx.exec("echo one two | wc -w");
const argv = await sbx.exec(["echo", "one two | wc -w"]);
console.log("shell string:", shell.stdout.trim()); // 2
console.log("argv list:   ", argv.stdout.trim()); // the text, unchanged

// timeout takes seconds or a string such as "30s", "10m", "2h". This one finishes well inside it.
const quick = await sbx.exec("sleep 1 && echo finished", { timeout: "30s" });
console.log(`timeout 30s: ${quick.stdout.trim()}, took ${quick.durationMs} ms`);
// A command that runs past its timeout does not come back as a normal result on the test API yet:
// the call fails with ServiceError (HTTP 504) after about ten seconds. Catch it if you rely on timeouts.
try {
    await sbx.exec("sleep 60", { timeout: "2s" });
} catch (err) {
    if (!(err instanceof SandboxError)) throw err;
    console.log(`timeout 2s on sleep 60: ${err.constructor.name}, status ${err.status}`);
}

// A failing command does not throw. Look at ok and exitCode.
const failed = await sbx.exec("ls /does-not-exist");
console.log(`failing command: ok ${failed.ok}, exit ${failed.exitCode}, stderr: ${failed.stderr.trim()}`);

// check: true throws CommandError instead. The result is on err.result.
try {
    await sbx.exec("exit 3", { check: true });
} catch (err) {
    if (!(err instanceof CommandError)) throw err;
    console.log(`CommandError: ${err.message}; exit code ${err.result.exitCode}`);
}
