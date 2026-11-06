# Harness Runtime examples

`@digitalocean/dots/harness-runtime` runs managed agents on DigitalOcean: create a
session from an agent manifest, send it work, stream what it does, approve its
risky steps, and keep or branch its state. Each example below is a few lines of
customer code. The same code runs as a mocked test in
`tests/mocked/harnessRuntime.test.ts`, so these examples stay in step with the SDK.

## Run the examples

Each job below is also a script in this folder that runs against your account:

| Script | What it does |
| --- | --- |
| [`01-run-agent.ts`](01-run-agent.ts) | Creates a session, streams one run, destroys the session |
| [`02-approvals.ts`](02-approvals.ts) | Asks you on the terminal before the agent runs each shell command |
| [`03-persistent-workspace.ts`](03-persistent-workspace.ts) | Writes files in one session and reads them from the next |
| [`04-fork.ts`](04-fork.ts) | Checkpoints a session and runs two forks in parallel |
| [`05-cron-trigger.ts`](05-cron-trigger.ts) | Creates a weekday trigger, or lists the runs of an existing one (`TRIGGER_ID`) |
| [`06-webhook.ts`](06-webhook.ts) | Creates a custom webhook trigger, prints its setup, and with `WAIT_FOR_RUN=1` calls it and waits for the run |
| [`07-exec.ts`](07-exec.ts) | Creates a session, runs a command in it, prints the output and destroys the session |
| [`08-verify-agent-fix.ts`](08-verify-agent-fix.ts) | Hands the agent a bug, then checks its fix with a command |
| [`09-files.ts`](09-files.ts) | Copies a file over 50 MiB into a session and back, checked against the server's SHA-256, then streams it |
| [`10-background.ts`](10-background.ts) | Runs a web server in the background with `spawn`, queries it with a per-command `env`, then stops it |

```shell
DIGITALOCEAN_ACCESS_TOKEN=... npx tsx examples/harness-runtime/01-run-agent.ts "your prompt"
```

- [`agent.yaml`](agent.yaml): the agent the examples run, and a manifest to copy. It names the model; the API has no default model.
- [`agent-trigger.yaml`](agent-trigger.yaml): the agent for the trigger examples. Every tool is allowed, so a fired run never waits for an approval, and it calls OpenAI with your own key, because a trigger's sessions get no managed key.
- `HARNESS_MANIFEST`: a different manifest file to use instead.
- `HARNESS_INFERENCE_API_KEY`: an OpenAI API key, required by the trigger examples (05, 06). They add it to the trigger's manifest as the `OPENAI_API_KEY` secret, because a trigger's fresh sessions get no managed key.
- `DIGITALOCEAN_API_URL`: a different API endpoint. `new HarnessRuntime()` reads it too.
- `KEEP=1`: keep the triggers, workspace and environment an example creates. By default each example deletes what it created, and every session is destroyed at the end.
- `EMAIL` or `SLACK_WEBHOOK_URL`: for the trigger examples, send each run's result there.
- `WAIT_FOR_RUN=1`: the trigger examples cause a run (05 every minute, 06 calls its own webhook) and wait for it.

The scripts import from the repository's source; your code imports from the package:

```ts
import { HarnessRuntime } from "@digitalocean/dots/harness-runtime";
import { readFileSync } from "node:fs";

const hr = new HarnessRuntime(); // reads DIGITALOCEAN_ACCESS_TOKEN
const manifest = readFileSync("agent.yaml", "utf8");
```

The SDK sends a manifest exactly as given; it never fills in values from your
environment. A session created from a manifest gets a managed inference key
unless the manifest brings its own (a `HARNESS_INFERENCE_API_KEY` entry under
`secrets`), runs no agent (`harness: sandbox` or `none`), or you pass
`manageModelAccessKey: false`. The API saves such a manifest as a config for
the session; `destroy()` deletes that config again, which revokes the key.

## 1. Run an agent and stream its answer

```ts
const session = await hr.sessions.create({ manifest }); // returns once the session is ready
const result = await session.run("Find and fix the flaky test", {
    onText: (text) => process.stdout.write(text),
});
console.log(result.status, result.usage); // "completed", token and cost totals
```

`run` waits up to 30 minutes for the run to end, then raises `TimeoutError`;
pass `timeoutMs` to change that (0 waits without limit). A timeout, like
`signal`, stops the wait and not the run: `session.cancel(runId)` or
`destroy()` stops the run.

To destroy a session automatically when a block ends, even when it throws,
declare it with `await using`:

```ts
await using session = await hr.sessions.create({ manifest });
```

> **Versions.** `await using` needs TypeScript 5.2 or later, and the runtime
> that runs your code must define `Symbol.asyncDispose`: Node 20 and later,
> current Bun and Deno 2 do. Plain JavaScript that uses `await using` itself,
> not compiled by TypeScript, needs a runtime that supports the syntax. Check
> with `node -e "console.log(typeof Symbol.asyncDispose)"` (or `bun -e`,
> `deno eval`): it should print `symbol`. Otherwise call `session.destroy()` in
> a `finally` block; it does the same thing.

Neither runs when the process is killed. Ctrl-C (SIGINT) ends a Node process
at once unless something listens for it, so the examples turn the first Ctrl-C
into a `signal` that stops the current wait; the error then unwinds through
`await using` and the session is destroyed. A second Ctrl-C quits at once.

## 2. Approve risky steps

```ts
await session.run("Upgrade the dependencies and push a branch", {
    onApproval: (req) => (req.category === "permission" ? req.approve() : req.reject("not now")),
});
```

An approval request carries `category` (`permission`, `question` or
`plan_approval`), `toolName` where the agent reports it, and the agent's full
`details`. Without `onApproval` the request stays pending until something else
resolves it, for example `session.resolveApproval(id, "approve")`.

## 3. Keep files across sessions with a persistent workspace

```ts
const ws = await hr.workspaces.create({ name: "repo-cache", sizeLimitGib: 10 });
const env = await hr.environments.create({ name: "repo-agent", manifest });
{
    await using first = await hr.sessions.create({ environment: env, workspace: ws });
    await first.run("Clone the repo and install");
} // destroyed here, which releases the workspace
await hr.workspaces.waitUntilAvailable(ws.id);
await using second = await hr.sessions.create({ environment: env, workspace: ws });
await second.run("Run the tests");
```

A persistent workspace is mounted at `/workspace`, the same folder
`session.files` reads and writes:

```ts
await session.files.upload("notes.txt", "hello");                      // string, bytes, Blob, or a stream
const bytes = await session.files.download("notes.txt");               // up to 50 MiB, checksum-verified
const body = await session.files.download("data.tar", { format: "stream" }); // any size, as a ReadableStream

// Node: copy a local file in or out, at any size up to 50 GiB.
await session.files.copyFromLocal("model.bin", "model.bin");
await session.files.copyToLocal("results.tar", "results.tar"); // checked against the server's SHA-256
```

Uploads over 50 MiB, and any stream, go through a staged transfer: the parts
go straight to object storage, up to 50 GiB in all.

## 4. Fork a session to try two approaches

```ts
const cp = await session.checkpoint({ label: "before-fix" });
const [a, b] = await session.fork({ from: cp, count: 2 }); // both ready
await Promise.all([a.run("Fix it with a retry"), b.run("Fix it with a mock")]);
```

## 5. Run an agent on a schedule

```ts
const daily = await hr.triggers.cron({
    name: "standup",
    schedule: "0 9 * * 1-5",
    timezone: "Asia/Kolkata",
    manifest,
    prompt: "Summarise yesterday's merged pull requests",
    output: { slack: process.env.SLACK_WEBHOOK_URL! },
});
for await (const run of daily.executions({ status: "failed" })) console.log(run.id, run.failureReason);
```

## 6. Run an agent on every GitHub pull request

```ts
const { setup } = await hr.triggers.webhook({
    name: "pr-review",
    provider: "github",
    manifest,
    prompt: "Review this pull request",
});
console.log(setup.text); // payload URL, the signing secret (shown once) and where to paste it
```

## 7. Run commands yourself

```ts
// Any session can run commands. harness: "sandbox" gives one with no agent installed.
const sandbox = await hr.sessions.create({ manifest: { harness: "sandbox" } });

const { stdout } = await sandbox.exec(["echo", "hello"]); // an array runs as given
const check = await sandbox.exec("npm test", { cwd: "/workspace/app" }); // a string runs through sh -c
if (check.exitCode !== 0) console.log(check.stderr);

// Pass onStdout or onStderr to see output while the command runs.
await sandbox.exec("npm run build", {
    onStdout: (text) => process.stdout.write(text),
    onStderr: (text) => process.stderr.write(text),
});
```

A command that exits non-zero is returned, not thrown. Commands run in
`/workspace` unless you pass `cwd`. `stdin` sends input once, up front.

```ts
await sandbox.exec("npm test", { env: { CI: "1" } });
```

> **`env` applies to that one command only.** It is not stored on the session:
> the next command does not see it, and commands running at the same time each
> see only their own. For variables every command and the agent see, set `env`
> in the manifest when you create the session.

To start a command and carry on while it runs, `spawn` it:

```ts
const dev = await sandbox.spawn("npm run dev", { onStdout: (t) => process.stdout.write(t) });
// ... port-forward to it, run tests against it ...
dev.kill(); // or: const { exitCode } = await dev.wait();
```

### Preview: live stdin

```ts
const python = await sandbox.spawn(["python3", "-i"], { stdin: true, onStdout: (t) => process.stdout.write(t) });
await python.write("print(1 + 1)\n");
await python.closeStdin();
const { exitCode } = await python.wait(); // python.kill() stops it instead
```

> **Built ahead of the API.** Only buffered `exec` is in the published API
> spec today. Streaming output works on the server but is not in the spec yet;
> the SDK follows the server's current implementation; `exec` with callbacks
> and `spawn` without `stdin` use it. `spawn` with `stdin: true` follows the
> server team's implementation plan for live stdin as of November 2026, and is
> **not available on the API yet**: until it is, it stops the command and
> raises an error. Its route and field names may still change before they are
> published, and `stdin: true` may change with them.

## Live events and port-forward

```ts
for await (const event of session.events()) {
    console.log(event.type, event.payload);
}
```

The event stream reconnects on its own and resumes after the last event your loop
finished with. Leave the loop to disconnect.

Port-forward needs a WebSocket that can send the `Authorization` header. Under
Node, pass a factory, for example over the `ws` package:

```ts
import WebSocket from "ws";
const hr = new HarnessRuntime({ webSocketFactory: (url, headers) => new WebSocket(url, { headers }) });
const tunnel = await session.portForward(8080, (bytes) => process.stdout.write(bytes));
```

## Errors

Every failed call raises a typed error with the HTTP status and the request id:
`NotFoundError`, `ConflictError`, `NotEnabledError` (403), `PaymentRequiredError`
(402), `LockedError` (423), `RateLimitError` (429, with `retryAfter`),
`ServiceError` (5xx), and `SessionFailedError` when a session fails instead of
becoming ready, which `sessions.create` destroys before raising it. A wait that
runs out of time raises `TimeoutError`. All extend `HarnessRuntimeError`.

## Limitations

These come from the API as it is today. The SDK does not work around them.

- A trigger that starts a fresh session per run gets no managed inference key:
  give its manifest a key of your own in `secrets`, as the trigger examples do
  with an OpenAI key from your environment. A trigger that resumes a session uses that
  session's key.
- A trigger cannot be fired on demand. A cron trigger runs on its schedule; a
  webhook trigger runs when the external system sends a signed delivery.
- Trigger runs are read by polling `executions()`. To have each result pushed,
  set `output` to Slack or email.
- A cron tick is skipped, without a record, while the trigger's previous run is
  still active. A run can start up to about a minute after its scheduled time.
- A run's end is known only from its events: there is no endpoint that reports a
  run's status. If the event stream cannot be recovered, `run` raises an error
  instead of guessing the outcome.
- `files.download` returns up to 50 MiB. Larger files need `{ format: "stream" }`
  or `copyToLocal`. A stream is not checked against a checksum; `copyToLocal`
  checks it. Staged transfers are limited to 50 GiB.
- A persistent workspace cannot be resized or renamed after it is created.
- A workspace's files are read and written through a session that has it
  attached. There is no file access on the workspace itself.
- To attach a persistent workspace, create the session from a saved environment.
  A session created from an inline manifest cannot take a workspace.
- Checkpoints exclude the persistent workspace disk, and restoring a checkpoint
  taken from a session with a workspace attached is refused.
- A buffered `exec` (no `onStdout` or `onStderr`) has 240 seconds to finish,
  by default and at most, and its stdout and stderr are each cut off past
  1 MiB, which sets `truncated`. A streamed `exec` has 15 minutes, by default
  and at most, and its output is not cut off.
- A streamed `exec` is not resumed if the connection drops: closing the stream
  cancels the command, so the SDK raises an error instead of guessing the
  outcome.
- There is no interactive shell (resize, Ctrl-C). Live stdin (`spawn` with
  `stdin: true`) is not on the API yet; see the preview note above.
- `exec` and `spawn` apply `env` by running the command through `env` in the
  sandbox, for that one command only.
