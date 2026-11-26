# Sandbox examples

A sandbox is a small, isolated Linux machine that you create, run commands in, pause and
delete through the API. `@digitalocean/dots/sandbox` wraps that API: create a sandbox, run
commands and read their output as it arrives, send input, snapshot the machine, build your
own templates, and clean up. Each example below is a few lines of customer code, and each
one is a script in this folder that runs against your account. Work through them in order.

> **Status.** The Sandbox SDK is pre-release (branch `feat/sandbox-sdk`) and these examples
> were run against the internal test API. A few calls do not work there yet; see
> [What works today](#what-works-today-and-known-issues). The scripts handle those cases
> and say so instead of crashing.

## Set up

You need Node.js 20.10 or later, a DigitalOcean API token, and (for now) the address of the
test API.

From a clone of this repository:

```shell
npm install
```

To use the package in your own project instead:

```shell
npm install github:digitalocean/dots#feat/sandbox-sdk
```

Set your credentials. Never commit them:

```shell
export DIGITALOCEAN_ACCESS_TOKEN=<your-token>
export DIGITALOCEAN_API_URL=<test-api-address>   # leave unset for the public API
```

Check that they work (this lists your sandboxes and prints how many there are):

```shell
cat > check.ts <<'TS'
import { Sandbox } from "./src/dots/sandbox/index.js";
let n = 0;
for await (const _ of Sandbox.list()) n++;
console.log(`credentials work: ${n} sandboxes`);
TS
npx tsx check.ts && rm check.ts
```

## Run the examples

| Script | What it does |
| --- | --- |
| [`01-hello.ts`](01-hello.ts) | Creates a sandbox, runs `echo` and `uname -a`, prints the output, deletes it |
| [`02-exec-options.ts`](02-exec-options.ts) | `cwd`, `env`, `timeout`, shell string vs argv list, a failing command, `check: true` |
| [`03-stream-output.ts`](03-stream-output.ts) | Reads output while a command runs: `onStdout`, then the event stream |
| [`04-stdin.ts`](04-stdin.ts) | Writes to a running command's stdin, and the one-line `stdin` option |
| [`05-lifecycle.ts`](05-lifecycle.ts) | `list`, `get`, `pause`, `resume`, `connect`, `getInfo`, `isRunning`, delete |
| [`06-files.ts`](06-files.ts) | The files API, with an `exec` and base64 fallback |
| [`07-snapshots.ts`](07-snapshots.ts) | Creates a snapshot, waits for it, gets it, deletes it |
| [`08-templates.ts`](08-templates.ts) | Lists your templates; with `TEMPLATE_IMAGE`, builds one and runs a sandbox from it |
| [`09-errors.ts`](09-errors.ts) | Triggers and catches `NotFoundError`, `InvalidRequestError`, `AuthenticationError`, `SandboxError` |
| [`10-parallel.ts`](10-parallel.ts) | Runs three sandboxes at the same time |
| [`11-cleanup.ts`](11-cleanup.ts) | Lists (and with `DELETE=1`, deletes) sandboxes older than `MAX_AGE_HOURS` |
| [`12-agent-session.ts`](12-agent-session.ts) | `Sandbox.create({ manifest })`: an agent session (harness API) next to a bare sandbox (sandbox API), and the calls each blocks |

```shell
npx tsx examples/sandbox/01-hello.ts
```

The scripts import from the repository's source; your code imports from the package:

```ts
import { Sandbox } from "@digitalocean/dots/sandbox";
```

Every script deletes what it creates, also when it fails or you press Ctrl-C. Scripts
use `await using`, which needs TypeScript 5.2 or later (`npx tsx` handles it).

## 1. Hello sandbox

```ts
await using sbx = await Sandbox.create();      // returns once it is running
const uname = await sbx.exec("uname -a");
console.log(uname.stdout, uname.exitCode, uname.ok);
```

`Sandbox.create()` uses the template `coding-base`, size `mars-2vcpu-4gb` and internet
access. `exec` runs a string as `bash -lc <string>`, waits, and returns `stdout`, `stderr`,
`exitCode` and `ok`. `await using` deletes the sandbox when the script ends, even on an error.

Expected: the echo text, a `Linux ...` line, `exit code: 0`, `ok: true`.

Try this: pass `{ size: "..." }` or `{ envVars: { MY_KEY: "value" } }` to `create`.

## 2. Exec options

```ts
await sbx.exec("pwd && echo $GREETING", { cwd: "/tmp", env: { GREETING: "hi" } });
await sbx.exec(["echo", "one two | wc -w"]);          // argv list: no shell
await sbx.exec("sleep 1", { timeout: "30s" });        // "30s", "10m", or seconds
const failed = await sbx.exec("ls /nope");            // does not throw
console.log(failed.ok, failed.exitCode);              // false 2
try {
    await sbx.exec("exit 3", { check: true });        // throws on a non-zero exit
} catch (err) {
    if (err instanceof CommandError) console.log(err.result.exitCode);
}
```

A string goes through a shell, so pipes and `&&` work. An array runs the program directly,
so the text is passed as is. A failing command is a normal result unless you set `check`.

Expected: `/tmp`, the env value, `2` for the shell string and the unchanged text for the
argv list, a finished command, `ok false, exit 2`, and `CommandError ... exit code 3`.

Try this: change `timeout` to `"2s"` on `sleep 60` (see the timeout note below).

## 3. Stream output

```ts
await sbx.exec(loop, { onStdout: (text) => process.stdout.write(text) });

const session = await sbx.exec.start(["bash", "-c", "echo out; echo err >&2"]);
for await (const event of session) {
    // event.type: "started" | "stdout" | "stderr" | "exit"
}
```

`onStdout` and `onStderr` run for each chunk as it arrives. `exec.start` returns a session
you iterate for `started`, `stdout`, `stderr` and `exit` events. Read a session once, with
either iteration or `wait()`.

Expected: `[live] tick 1` to `tick 3` one second apart, then one line per event.

Try this: add `onStderr` to the first call.

## 4. Stdin

```ts
const session = await sbx.exec.start(["cat"]);
await session.writeStdin("first line\n");
await session.writeStdin("second line\n");
await session.closeStdin();                  // cat sees end of input
const result = await session.wait();

await sbx.exec("wc -l", { stdin: "a\nb\nc\n" });  // one input, sent then closed
```

Expected: the two lines echoed by `cat`, then `wc -l counted: 3`.

Try this: start `["bash"]` and write commands to it, one per line.

## 5. Lifecycle

```ts
for await (const item of Sandbox.list()) { /* find yours by sandboxId */ }
const fetched = await Sandbox.get(id);
await sbx.pause();      // await sbx.getInfo(), await sbx.isRunning()
await sbx.resume();
const again = await Sandbox.connect(id);   // resumes it if it is paused
await sbx.kill();                          // true if it deleted something
```

`get` fetches without changing the state. `connect` fetches and resumes a paused sandbox.
`sbx.state` is set when you create or fetch; `getInfo()` re-reads it.

Expected: `SANDBOX_STATE_RUNNING`, then `SANDBOX_STATE_PAUSED`, then running again, then
`NotFoundError` after the delete.

Try this: `Sandbox.list({ state: "SANDBOX_STATE_PAUSED" })`.

## 6. Files

```ts
await sbx.files.write("/tmp/demo/hello.txt", "hello\n");
await sbx.files.readText("/tmp/demo/hello.txt");
await sbx.files.list("/tmp/demo");   // also exists, makeDir, move, remove
```

On the test API every `files` call fails (see known issues). The script catches
`ConflictError` and `NotFoundError`, prints "The files API is not available on this
template yet", and shows the same idea with `exec`: it sends the content as base64 in an
environment variable, so quoting never breaks it.

Expected: the "not available" message, then `read back: "hello from the fallback\n"` and an `ls -l`.
When the files API works you see the read, exists, list, move and remove steps instead.

Try this: write a file with quotes and newlines in it.

## 7. Snapshots

```ts
const snapshot = await sbx.createSnapshot({ name, ttl: "1h" });  // both optional
await snapshot.waitUntilReady();      // polls until complete, throws if it fails
const fetched = await Snapshot.get(snapshot.snapshotId);
await Snapshot.delete(snapshot.snapshotId);
```

The name is 1 to 63 characters of lowercase letters, digits and hyphens, so the script adds
a timestamp suffix. `Snapshot.list` does not work on the test API; the script prints
"Snapshot.list is not available yet" and goes on. The snapshot is deleted in a `finally`.

Expected: `SNAPSHOT_STATE_CREATING`, then `SNAPSHOT_STATE_COMPLETE`, `get`, the list note, `deleted: true`.

Try this: change `ttl` to `"168h"`.

## 8. Templates

```ts
for await (const t of Template.list()) console.log(t.name, t.status);

const template = await Template.create({ name, sourceOciRef: image });
await template.waitUntilReady();
const sbx = await Sandbox.create({ template: template.name });
// ... run a command, then delete the sandbox, then template.delete()
```

`Template.list()` shows only your own templates. Built-in ones such as `coding-base` are
not listed; pass them by name to `Sandbox.create`. To build one, set `TEMPLATE_IMAGE` to an
OCI image reference such as `registry.digitalocean.com/<team>/<image>:<tag>`. The build is
asynchronous and can take minutes. Without `TEMPLATE_IMAGE` the script lists templates,
prints this hint and exits 0.

Expected without the variable: your templates and the hint. With it: the template becomes
`TEMPLATE_STATUS_READY`, a command runs in a sandbox made from it, both are deleted.

Try this: `template.builds().nextItems()` shows the build history.

## 9. Errors

```ts
try {
    await Sandbox.get("00000000-0000-0000-0000-000000000000");
} catch (err) {
    if (err instanceof NotFoundError) console.log(err.status, err.code, err.requestId);
    else if (err instanceof SandboxError) { /* any other SDK error */ }
    else throw err;
}
```

Every failure is a subclass of `SandboxError` with `status`, `code`, `requestId` and, for
429, `retryAfter`. The script shows four: `NotFoundError` (404), `InvalidRequestError`
(an unknown size, 422), a plain `SandboxError` (a bad snapshot name such as `"Bad Name"`,
rejected by the SDK before any request, status 0) and `AuthenticationError` (a wrong token,
401). The wrong token is passed as `{ token }` to that one call; your environment is untouched.
`requestId` is empty on the test API.

Expected: four blocks, each with the class, message, status, code and requestId.

Try this: catch `RateLimitError` and wait `retryAfter` seconds.

## 10. Parallel

```ts
const lines = await Promise.all(
    [0, 1, 2].map(async (i) => {
        const sbx = await Sandbox.create();
        created.push(sbx);
        return (await sbx.exec(`echo worker ${i}`)).stdout;
    }),
);
// finally: await Promise.allSettled(created.map((s) => s.kill()));
```

Each task creates its own sandbox. The sandboxes are recorded as they are created, so the
`finally` block deletes all of them even if one task fails.

Expected: three lines and a total time close to the time of one sandbox.

Try this: raise `COUNT`. Watch your account's sandbox limits.

## 11. Cleanup

```shell
npx tsx examples/sandbox/11-cleanup.ts                    # dry run
MAX_AGE_HOURS=24 npx tsx examples/sandbox/11-cleanup.ts
DELETE=1 npx tsx examples/sandbox/11-cleanup.ts           # delete what it lists
```

Lists every sandbox of the account older than `MAX_AGE_HOURS` (default 1). It deletes only
when `DELETE=1`. The list covers sandboxes created by other people or tools on the same
account, so read the dry run first.

Expected: one line per old sandbox with its state and age, and a count.

## What works today and known issues

Working on the test API: create, get, list, connect, pause, resume, kill; `sbx.exec(...)`
with every option, `exec.run`, `exec.start` sessions (`writeStdin`, `closeStdin`, `wait`,
iteration, `close`); `sbx.commands.list/start/kill`; snapshot create, `waitUntilReady`,
get and delete; template list, create, wait and delete.

Not working yet, and how the examples cope:

| Call | What you get | Workaround |
| --- | --- | --- |
| `sbx.files.upload` and `download` (`write`, `read`, `readText`) | `NotFoundError` (404) | Write and read through `exec` and base64 (example 6) |
| Other `sbx.files.*` (`list`, `exists`, `makeDir`, `move`, `remove`, `getInfo`) | `ConflictError`: "this sandbox's template image does not support file system operations" | Same |
| `Snapshot.list` | `NotFoundError` (404) | Keep the snapshot ids you create (example 7) |
| `exec.start(..., { pty })` | `InvalidRequestError` | Use pipes; `exec.start` without `pty` works |
| `commands.connect(pid).writeStdin` | 404 | Use `exec.start` and `writeStdin` (example 4) |
| `commands.run` for a command that exits instantly | fails (output is readable only while the command runs) | Use `sbx.exec` |
| `exec` with a `timeout` that the command exceeds | `ServiceError` (HTTP 504) after about ten seconds, not a result with a non-zero exit | Catch `SandboxError`; keep commands inside the timeout |

## Cost and cleanup

Sandboxes bill for as long as they exist, also while paused. Every script deletes what it
creates (`await using` or `finally`), and Ctrl-C deletes the sandbox before the script
quits. If a script is killed hard (`kill -9`, a lost connection), a sandbox can be left
behind: run `11-cleanup.ts` to find it, and `DELETE=1` to delete it. These scripts have no `KEEP=1` switch; to
inspect a sandbox, create one in your own script and delete it when you finish.

## Environment variables

| Variable | Used by | Meaning |
| --- | --- | --- |
| `DIGITALOCEAN_ACCESS_TOKEN` | all | Your API token (required) |
| `DIGITALOCEAN_API_URL` | all | API address, for example `<test-api-address>`; defaults to the public API |
| `TEMPLATE_IMAGE` | 08 | OCI image to build a template from, such as `registry.digitalocean.com/<team>/<image>:<tag>` |
| `MAX_AGE_HOURS` | 11 | Only sandboxes older than this are listed; default `1` |
| `DELETE` | 11 | `1` deletes the listed sandboxes; anything else is a dry run |
