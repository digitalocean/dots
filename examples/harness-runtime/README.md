# Harness Runtime examples

`@digitalocean/dots/harness-runtime` runs managed agents on DigitalOcean: create a
session from an agent manifest, send it work, stream what it does, approve its
risky steps, and keep or branch its state. Each example below is a few lines of
customer code. The same code runs as a mocked test in
`tests/mocked/harnessRuntime.test.ts`, so these examples stay in step with the SDK.

```ts
import { HarnessRuntime } from "@digitalocean/dots/harness-runtime";
import { readFileSync } from "node:fs";

const hr = new HarnessRuntime(); // reads DIGITALOCEAN_TOKEN
const manifest = readFileSync("agent.yaml", "utf8");
```

## 1. Run an agent and stream its answer

```ts
const session = await hr.sessions.create({ manifest }); // returns once the session is ready
const result = await session.run("Find and fix the flaky test", {
    onText: (text) => process.stdout.write(text),
});
console.log(result.status, result.usage); // "completed", token and cost totals
```

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
await (await hr.sessions.create({ environment: env, workspace: ws })).run("Clone the repo and install");
await (await hr.sessions.create({ environment: env, workspace: ws })).run("Run the tests");
```

A persistent workspace is mounted at `/workspace`, the same folder
`session.files.upload` and `session.files.download` read and write. Downloads are
checked against the checksum the server sends with them.

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
becoming ready. All extend `HarnessRuntimeError`.

## Limitations

These come from the API as it is today. The SDK does not work around them.

- A trigger cannot be fired on demand. A cron trigger runs on its schedule; a
  webhook trigger runs when the external system sends a signed delivery.
- Trigger runs are read by polling `executions()`. To have each result pushed,
  set `output` to Slack or email.
- A cron tick is skipped, without a record, while the trigger's previous run is
  still active. A run can start up to about a minute after its scheduled time.
- A run's end is known only from its events: there is no endpoint that reports a
  run's status. If the event stream cannot be recovered, `run` raises an error
  instead of guessing the outcome.
- Each file upload or download is limited to 50 MiB.
- To attach a persistent workspace, create the session from a saved environment.
  A session created from an inline manifest cannot take a workspace.
- Checkpoints exclude the persistent workspace disk, and restoring a checkpoint
  taken from a session with a workspace attached is refused.
- The SDK does not cover streaming exec, interactive shells, per-command
  environment variables or live stdin. Buffered exec is available through the
  generated client.
