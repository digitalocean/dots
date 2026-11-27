# Agent sandbox examples

`Sandbox.create({ agent })` (or `Sandbox.create({ manifest })`) in `@digitalocean/dots/sandbox` creates an agent session through the
**harness API** and returns an `AgentSandbox` (`kind: "session"`, with `sessionId` and `sandboxId`).
`Sandbox.create()` with no manifest is a bare sandbox on the sandbox API, covered in the
[sandbox examples](../sandbox/README.md).

On an `AgentSandbox`, `box.<call>` (`exec`, `files`, `spawn`, `pause`, `kill`) is the **sandbox API** on the session's
sandbox, and `box.agent.<call>` (`run`, `send`, `events`, `checkpoint`, `fork`, `destroy`) is the **harness API**.
A bare `Sandbox` has no agent: calls on its `agent` reject with `UnsupportedError`.

Set up the same way as the [sandbox examples](../sandbox/README.md#set-up): Node.js 20.10 or later,
`npm install`, and

```shell
export DIGITALOCEAN_ACCESS_TOKEN=<your-token>
export DIGITALOCEAN_API_URL=<api-address>   # leave unset for the public API
```

Every script creates what it needs, and `await using` deletes it when the script ends (TypeScript 5.2 or
later, Node 20 or later). The manifest is [`../harness-runtime/agent.yaml`](../harness-runtime/agent.yaml): OpenCode
on a DigitalOcean model.

## Run the examples

| Script | Calls shown |
| --- | --- |
| [`01-create.ts`](01-create.ts) | `Sandbox.create({ manifest })`: YAML or object, `name`, `wait`, `timeoutMs`, `manageModelAccessKey`, and what it refuses |
| [`02-get-session.ts`](02-get-session.ts) | `Sandbox.getSession(id)`, and how it differs from `get` and `connect` |
| [`03-exec.ts`](03-exec.ts) | `box.exec` (sandbox API): string vs argv, `cwd`, `env`, `timeout`, `stdin`, streaming, `execStream`, `check`, and `box.agent.exec` (harness API) |
| [`04-files.ts`](04-files.ts) | `box.files` (sandbox API): `write`, `readText`, `list`, `move`, `exists`, `makeDir`, `remove`; `box.agent.files` (harness API): `copyFromLocal`, `copyToLocal` |
| [`05-run-send-events.ts`](05-run-send-events.ts) | `box.agent.run`, `box.agent.send`, `box.agent.events` (starts the agent, which uses inference) |
| [`06-spawn.ts`](06-spawn.ts) | `box.spawn` and `box.processes` (sandbox API): a background server; `box.agent.spawn` (harness API): live stdin |
| [`07-lifecycle.ts`](07-lifecycle.ts) | `getInfo`, `pause`, `resume`, `kill` (true, then false) on the sandbox API; `box.agent.refresh`, `destroy` and `await using` on the harness API |
| [`08-errors.ts`](08-errors.ts) | the sandbox error classes for harness failures, `UnsupportedError`, refused options |
| [`09-client.ts`](09-client.ts) | `SandboxClient`: bind the token once |
| [`10-approvals.ts`](10-approvals.ts) | human in the loop: `onApproval` on `run` (you answer on the terminal), and `events` with `box.agent.approve` (a policy answers from code) |
| [`11-agent-option.ts`](11-agent-option.ts) | `Sandbox.create({ agent: new Agent(harness, { model, env, secrets, permissions }) })` instead of a manifest (or the plain object), and `box.agent`: `run`, `send`, `history`, `cancel` |
| [`12-triggers.ts`](12-triggers.ts) | `Sandbox.trigger({ agent \| manifest, cron \| webhook })` for a fresh session per run, and `box.trigger({ ..., pause })` bound to a session |
| [`13-spec-surface.ts`](13-spec-surface.ts) | the spec's shape: `Image`, `egress`, `Permissions` + `Bash`, `box.agent.run` as a property with `onApproval`, and `execStream` |

```shell
npx tsx examples/agentSandbox/01-create.ts
```

## Not on a bare sandbox

`send`, `run`, `events`, `agent` and the other agent-session calls exist only on an
`AgentSandbox`. A bare `Sandbox` (from `Sandbox.create()`) does not have them:

- `bare.send("hi")` is a compile error in TypeScript, and in plain JavaScript or a REPL it fails with
  `TypeError: bare.send is not a function`. No request is sent.
- `bare.agent.run("hi")` returns a promise that rejects with `UnsupportedError`. Reading `bare.agent` does not throw, so catch the rejection and carry on.
- To use them, create the sandbox with an agent: `Sandbox.create({ agent })` or `Sandbox.create({ manifest })`.

[`08-errors.ts`](08-errors.ts) shows the `UnsupportedError`.

## What is on `box.agent` only

- `box.agent.spawn(cmd, { stdin: true })` for live stdin (enabled team by team). The sandbox API's live stdin is `box.exec.start`.
- `box.agent.files` (`upload`, `download`, `copyFromLocal`, `copyToLocal`) is the harness files API. `box.files` is the sandbox API's.
- Approvals, checkpoints, forks, cancel and port forwarding are on `box.agent`
  (see [examples/harness-runtime](../harness-runtime/README.md)).
