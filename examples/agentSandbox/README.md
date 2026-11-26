# Agent sandbox examples

`Sandbox.create({ agent })` (or `Sandbox.create({ manifest })`) in `@digitalocean/dots/sandbox` creates an agent session through the
**harness API** and returns an `AgentSandbox` (`kind: "session"`, with `sessionId` and `sandboxId`).
`Sandbox.create()` with no manifest is a bare sandbox on the sandbox API, covered in the
[sandbox examples](../sandbox/README.md).

Every call on an `AgentSandbox` goes to the harness API, by session id. It never calls the sandbox API, and a
bare `Sandbox` never calls the harness API (its `session` throws `UnsupportedError`).

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
| [`03-exec.ts`](03-exec.ts) | `box.exec`: string vs argv, `cwd`, `env`, `timeout`, `stdin`, streaming, `signal`, `check`, `truncated` |
| [`04-files.ts`](04-files.ts) | `box.files`: `upload`, `download`, `downloadText`, `copyFromLocal`, `copyToLocal` |
| [`05-run-send-events.ts`](05-run-send-events.ts) | `box.run`, `box.send`, `box.events` (starts the agent, which uses inference) |
| [`06-spawn.ts`](06-spawn.ts) | `box.session.spawn`: a background server, and live stdin |
| [`07-lifecycle.ts`](07-lifecycle.ts) | `getInfo`, `waitUntilReady`, `pause`, `resume`, `kill` (true, then false), `await using` |
| [`08-errors.ts`](08-errors.ts) | the sandbox error classes for harness failures, `UnsupportedError`, refused options |
| [`09-client.ts`](09-client.ts) | `SandboxClient`: bind the token once |
| [`10-approvals.ts`](10-approvals.ts) | human in the loop: `onApproval` on `run` (you answer on the terminal), and `events` with `session.resolveApproval` (a policy answers from code) |
| [`11-agent-option.ts`](11-agent-option.ts) | `Sandbox.create({ agent: { harness, model, env, secrets, permissions } })` instead of a manifest, and `box.agent()`: `run`, `send`, `history`, `cancel` |

```shell
npx tsx examples/agentSandbox/01-create.ts
```

## Not on a bare sandbox

`send`, `run`, `events`, `session`, `files.upload` and the other agent-session calls exist only on an
`AgentSandbox`. A bare `Sandbox` (from `Sandbox.create()`) does not have them:

- `bare.send("hi")` is a compile error in TypeScript, and in plain JavaScript or a REPL it fails with
  `TypeError: bare.send is not a function`. No request is sent.
- `bare.session` throws `UnsupportedError` (its type is `never`), so `bare.session.send("hi")` does not compile.
- To use them, create the sandbox from a manifest: `Sandbox.create({ manifest })`.

[`08-errors.ts`](08-errors.ts) shows the `UnsupportedError`.

## Not on an agent session

- No PTY or `exec.start`. Use `box.session.spawn(cmd, { stdin: true })` for live stdin (enabled team by team).
- `box.files` has the harness methods. `list`, `move`, `exists` and `makeDir` are the bare sandbox's.
- Approvals, checkpoints, forks, cancel and port forwarding are on `box.session`
  (see [examples/harness-runtime](../harness-runtime/README.md)).
