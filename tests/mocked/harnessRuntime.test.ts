/**
 * The Harness Runtime SDK against mocked endpoints.
 *
 * The first six tests are the six showcase jobs from
 * examples/harness-runtime/README.md, written the way a customer would, against
 * the wire shapes the API serves. If the API's generated client or this layer
 * drifts, the examples fail here.
 */
import nock from "nock";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    ConflictError,
    HarnessRuntime,
    NotFoundError,
    RateLimitError,
    SessionFailedError,
    TimeoutError,
} from "../../src/dots/harnessRuntime/index.js";

const API = "https://api.digitalocean.com";
const hr = () => new HarnessRuntime({ token: "test-token", pollIntervalMs: 1 });

const MANIFEST = "harness: claude-code\nmodel: claude-sonnet\n";

const session = (id: string, status = "SESSION_STATUS_READY", extra: Record<string, unknown> = {}) => ({
    session_id: id,
    name: id,
    status,
    ...extra,
});

/** One SSE frame carrying a server event envelope. */
const frame = (id: string, type: string, data: unknown = {}, runId?: string) =>
    `event: ${type}\nid: ${id}\ndata: ${JSON.stringify({ event_id: id, run_id: runId, type, data })}\n\n`;

const sse = (...frames: string[]) => frames.join("");

/** Captures a JSON request body for assertions. */
function capture() {
    const seen: { body?: Record<string, unknown>; headers?: Record<string, string | string[]> } = {};
    return {
        seen,
        body(body: Record<string, unknown>) {
            seen.body = body;
            return true;
        },
    };
}

beforeEach(() => nock.cleanAll());
afterAll(() => nock.restore());

describe("showcase jobs", () => {
    it("1. runs an agent and streams its answer", async () => {
        let contentType = "";
        nock(API)
            .post("/v2/agents/sessions", (body) => typeof body === "string" && body.includes("harness: claude-code"))
            .query({ manage_model_access_key: "true" }) // the agent's inference key is minted by the API
            .reply(function () {
                contentType = String(this.req.headers["content-type"]);
                return [201, { session: session("s1", "SESSION_STATUS_PROVISIONING") }];
            })
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .get("/v2/agents/sessions/s1/events")
            .reply(
                200,
                sse(
                    frame("01A", "stream.state", { state: "live" }),
                    frame("01B", "run.token_delta", { text: "old run" }, "run-0"),
                    frame("01C", "run.started", {}, "run-1"),
                    frame("01D", "run.token_delta", { text: "Fixed " }, "run-1"),
                    frame("01E", "run.token_delta", { text: "the test." }, "run-1"),
                    frame("01F", "run.completed", { total_tokens_in: 120, total_tokens_out: 30, run_cost_micros: 900 }, "run-1"),
                ),
                { "Content-Type": "text/event-stream" },
            )
            .post("/v2/agents/sessions/s1/input", { text: "Find and fix the flaky test" })
            .reply(200, { run_id: "run-1" });

        // --- customer code ---
        const s = await hr().sessions.create({ manifest: MANIFEST });
        const streamed: string[] = [];
        const result = await s.run("Find and fix the flaky test", { onText: (t) => streamed.push(t) });
        // ---------------------

        expect(contentType).toBe("application/yaml");
        expect(streamed).toEqual(["Fixed ", "the test."]);
        expect(result).toEqual({
            runId: "run-1",
            status: "completed",
            text: "Fixed the test.",
            usage: { tokensIn: 120, tokensOut: 30, costMicros: 900 },
        });
    });

    it("2. lets a human approve a risky step", async () => {
        const resolved = capture();
        nock(API)
            .get("/v2/agents/sessions/s1/events")
            .reply(
                200,
                sse(
                    frame("01A", "stream.state", { state: "live" }),
                    frame(
                        "01B",
                        "run.human_input_requested",
                        { hitl_id: "h1", payload: { category: "permission", tool_name: "Bash", command: "git push" } },
                        "run-1",
                    ),
                    frame("01C", "run.completed", {}, "run-1"),
                ),
            )
            .post("/v2/agents/sessions/s1/input")
            .reply(200, { run_id: "run-1" })
            .post("/v2/agents/sessions/s1/hitl/h1", resolved.body)
            .reply(204);

        nock(API).get("/v2/agents/sessions/s1").reply(200, { session: session("s1") });
        const existing = await hr().sessions.get("s1");

        // --- customer code ---
        const result = await existing.run("Upgrade deps and push a branch", {
            onApproval: (req) => (req.category === "permission" ? req.approve() : req.reject("not now")),
        });
        // ---------------------

        expect(result.status).toBe("completed");
        expect(resolved.seen.body).toEqual({
            outcome: "HITL_OUTCOME_APPROVE",
            source: "RESOLUTION_SOURCE_OUT_OF_BAND",
        });
    });

    it("3. keeps files across sessions with a persistent workspace", async () => {
        const firstCreate = capture();
        nock(API)
            .post("/v2/agents/workspaces", { name: "repo-cache", size_limit_gib: 10 })
            .reply(201, { workspace: { workspace_id: "w1", name: "repo-cache", state: "AVAILABLE" } })
            .post("/v2/agents/configs", { name: "repo-agent", manifest_yaml: MANIFEST, manage_model_access_key: true })
            .reply(201, { config: { id: "6f1f0d3e-0000-4000-8000-000000000001", name: "repo-agent" } })
            .post("/v2/agents/sessions", firstCreate.body)
            .reply(201, { session: session("s1", "SESSION_STATUS_READY", { workspace_id: "w1" }) })
            .get("/v2/agents/sessions/s1/workspace/download")
            .query({ path: "README.md" })
            .reply(200, withFooter("cloned\n"));

        // --- customer code ---
        const client = hr();
        const ws = await client.workspaces.create({ name: "repo-cache", sizeLimitGib: 10 });
        const env = await client.environments.create({ name: "repo-agent", manifest: MANIFEST });
        const s = await client.sessions.create({ environment: env, workspace: ws });
        const readme = await s.files.downloadText("README.md");
        // ---------------------

        expect(firstCreate.seen.body).toEqual({
            config_id: "6f1f0d3e-0000-4000-8000-000000000001",
            name: expect.stringMatching(/^repo-agent-[a-z0-9]{8}$/), // required by the API for this form
            workspace_id: "w1",
        });
        expect(readme).toBe("cloned\n");
    });

    it("4. forks a session to try two approaches", async () => {
        nock(API)
            .post("/v2/agents/sessions/s1/checkpoints", { label: "before-fix" })
            .reply(201, { checkpoint: { checkpoint_id: "cp1", label: "before-fix" } })
            .post("/v2/agents/sessions/s1/fork", { from_checkpoint_id: "cp1", count: 2 })
            .reply(201, { sessions: [session("f1", "SESSION_STATUS_PROVISIONING"), session("f2")] })
            .get("/v2/agents/sessions/f1")
            .reply(200, { session: session("f1") })
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") });

        const client = hr();
        const s = await client.sessions.get("s1");

        // --- customer code ---
        const cp = await s.checkpoint({ label: "before-fix" });
        const [a, b] = await s.fork({ from: cp, count: 2 });
        // ---------------------

        expect([a.id, b.id]).toEqual(["f1", "f2"]);
        expect([a.status, b.status]).toEqual(["SESSION_STATUS_READY", "SESSION_STATUS_READY"]);
    });

    it("5. schedules an agent and lists its failed runs", async () => {
        const created = capture();
        nock(API)
            .post("/v2/agents/triggers", created.body)
            .reply(201, {
                trigger: {
                    trigger_id: "t1",
                    kind: "cron",
                    name: "standup",
                    cron: { cron_expr: "0 9 * * 1-5", timezone: "Asia/Kolkata", next_run_at: "2026-11-06T03:30:00Z" },
                },
            })
            .get("/v2/agents/triggers/t1/executions")
            .query({ status: "failed" })
            .reply(200, {
                executions: [{ execution_id: "e2", status: "failed", failure_reason: "The session failed." }],
                next_page_token: "p2",
            })
            .get("/v2/agents/triggers/t1/executions")
            .query({ status: "failed", page_token: "p2" })
            .reply(200, { executions: [{ execution_id: "e1", status: "failed" }], next_page_token: "" });

        // --- customer code ---
        const daily = await hr().triggers.cron({
            name: "standup",
            schedule: "0 9 * * 1-5",
            timezone: "Asia/Kolkata",
            manifest: MANIFEST,
            prompt: "Summarise yesterday's merged PRs",
            output: { slack: "https://hooks.slack.com/services/T/B/X" },
        });
        const failed = [];
        for await (const run of daily.executions({ status: "failed" })) failed.push(run.id);
        // ---------------------

        expect(created.seen.body).toEqual({
            kind: "cron",
            name: "standup",
            session_mode: "fresh",
            session_template: MANIFEST,
            prompt_template: "Summarise yesterday's merged PRs",
            output: { mode: "slack", slack: { webhook_url: "https://hooks.slack.com/services/T/B/X" } },
            cron: { cron_expr: "0 9 * * 1-5", timezone: "Asia/Kolkata" },
        });
        expect(daily.nextRunAt).toEqual(new Date("2026-11-06T03:30:00Z"));
        expect(failed).toEqual(["e2", "e1"]);
    });

    it("6. creates a GitHub-triggered agent with its setup steps", async () => {
        const created = capture();
        nock(API)
            .post("/v2/agents/triggers", created.body)
            .reply(201, {
                trigger: {
                    trigger_id: "t2",
                    kind: "webhook",
                    webhook: { provider: "github", webhook_url: "https://api.digitalocean.com/v2/agents/triggers/t2/webhook" },
                },
                webhook_secret: "s3cret",
            })
            .get("/v2/agents/webhook-providers")
            .reply(200, {
                providers: [
                    {
                        key: "github",
                        display_name: "GitHub",
                        paste_hint: "Paste the secret into Settings > Webhooks > Secret.",
                        signature: { header: "X-Hub-Signature-256", scheme: "hmac-sha256" },
                    },
                ],
            });

        // --- customer code ---
        const { trigger, setup } = await hr().triggers.webhook({
            name: "pr-review",
            provider: "github",
            manifest: MANIFEST,
            prompt: "Review this pull request",
        });
        // ---------------------

        expect(created.seen.body).toEqual(
            expect.objectContaining({ kind: "webhook", webhook: { provider: "github" }, output: { mode: "none" } }),
        );
        expect(trigger.id).toBe("t2");
        expect(setup).toEqual(
            expect.objectContaining({
                url: "https://api.digitalocean.com/v2/agents/triggers/t2/webhook",
                secret: "s3cret",
                provider: "GitHub",
                signatureHeader: "X-Hub-Signature-256",
            }),
        );
        expect(setup.text).toContain("Paste the secret into Settings > Webhooks > Secret.");
    });
});

describe("sessions", () => {
    it("raises SessionFailedError when the session fails instead of becoming ready, and destroys it", async () => {
        const scope = nock(API)
            .post("/v2/agents/sessions")
            .reply(201, { session: session("s1", "SESSION_STATUS_PROVISIONING") })
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1", "SESSION_STATUS_FAILED") })
            .delete("/v2/agents/sessions/s1") // the caller never gets the session, so create cleans it up
            .reply(204);

        await expect(hr().sessions.create({ environment: "6f1f0d3e-0000-4000-8000-000000000001" })).rejects.toBeInstanceOf(
            SessionFailedError,
        );
        expect(scope.isDone()).toBe(true);
    });

    it("deletes the config the API saved for a manifest session when it is destroyed", async () => {
        const CFG = "6f1f0d3e-0000-4000-8000-000000000009";
        const scope = nock(API)
            .post("/v2/agents/sessions")
            .query(true)
            .reply(201, { session: session("s1", "SESSION_STATUS_READY", { config_id: CFG }) })
            .delete("/v2/agents/sessions/s1")
            .reply(204)
            .delete(`/v2/agents/configs/${CFG}`) // revokes the managed key with it
            .reply(204);
        const s = await hr().sessions.create({ manifest: MANIFEST });
        await s.destroy();
        expect(scope.isDone()).toBe(true);
    });

    it("leaves a shared config to the last fork, and never deletes a saved environment", async () => {
        const CFG = "6f1f0d3e-0000-4000-8000-000000000009";
        const scope = nock(API)
            .post("/v2/agents/sessions")
            .query(true)
            .reply(201, { session: session("s1", "SESSION_STATUS_READY", { config_id: CFG }) })
            .post("/v2/agents/sessions/s1/fork")
            .reply(201, { sessions: [session("f1", "SESSION_STATUS_READY", { config_id: CFG })] })
            .delete("/v2/agents/sessions/s1")
            .reply(204)
            .delete(`/v2/agents/configs/${CFG}`)
            .reply(409, { id: "conflict", message: "agent config has active sessions" })
            .delete("/v2/agents/sessions/f1")
            .reply(204)
            .delete(`/v2/agents/configs/${CFG}`)
            .reply(204)
            .post("/v2/agents/sessions") // from a saved environment: its config is the caller's
            .reply(201, { session: session("s2", "SESSION_STATUS_READY", { config_id: CFG }) })
            .delete("/v2/agents/sessions/s2")
            .reply(204);
        const client = hr();
        const s = await client.sessions.create({ manifest: MANIFEST });
        const [fork] = await s.fork();
        await s.destroy(); // the fork still uses the config: 409, left for the fork
        await fork.destroy();
        await (await client.sessions.create({ environment: CFG })).destroy();
        expect(scope.isDone()).toBe(true);
    });

    it("stops waiting for a run after timeoutMs, naming the run", async () => {
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .get("/v2/agents/sessions/s1/events")
            .times(1000)
            .reply(200, sse(frame("01A", "stream.state", { state: "live" })), { "Content-Type": "text/event-stream" })
            .post("/v2/agents/sessions/s1/input")
            .reply(200, { run_id: "run-1" });
        const s = await hr().sessions.get("s1");
        const err = await s.run("go", { timeoutMs: 50 }).catch((e) => e);
        expect(err).toBeInstanceOf(TimeoutError);
        expect(err.message).toContain('session.cancel("run-1")');
    });

    it("does not send the prompt when the signal has already aborted", async () => {
        nock(API).get("/v2/agents/sessions/s1").reply(200, { session: session("s1") }); // no input interceptor
        const s = await hr().sessions.get("s1");
        const stop = new AbortController();
        stop.abort(new Error("interrupted"));
        await expect(s.run("go", { signal: stop.signal })).rejects.toThrow("interrupted");
    });

    it("refuses a workspace with an inline manifest instead of guessing a config name", async () => {
        await expect(
            hr().sessions.create({ manifest: MANIFEST, workspace: "w1" } as never),
        ).rejects.toThrow("save the manifest with environments.create");
    });

    it("reports a failed run with its code and message", async () => {
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .get("/v2/agents/sessions/s1/events")
            .reply(
                200,
                sse(
                    frame("01A", "stream.state", { state: "live" }),
                    frame("01B", "run.failed", { code: 3, message: "model quota exhausted" }, "run-1"),
                ),
            )
            .post("/v2/agents/sessions/s1/input")
            .reply(200, { run_id: "run-1" });

        const s = await hr().sessions.get("s1");
        await expect(s.run("go")).resolves.toEqual(
            expect.objectContaining({ status: "failed", error: { code: 3, message: "model quota exhausted" } }),
        );
    });

    it("maps API errors to typed errors with the request id", async () => {
        nock(API)
            .get("/v2/agents/sessions/missing")
            .reply(404, { id: "not_found", message: "session not found", request_id: "req-1" })
            .post("/v2/agents/workspaces")
            .reply(409, { id: "conflict", message: "workspace name is taken", request_id: "req-2" });

        const client = hr();
        await expect(client.sessions.get("missing")).rejects.toThrow(
            expect.objectContaining({ status: 404, message: "session not found", requestId: "req-1" }) as Error,
        );
        const conflict = await client.workspaces.create({ name: "taken", sizeLimitGib: 1 }).catch((e) => e);
        expect(conflict).toBeInstanceOf(ConflictError);
        expect(conflict.requestId).toBe("req-2");
    });

    it("types a 404 as NotFoundError", async () => {
        nock(API).get("/v2/agents/sessions/missing").reply(404, { message: "session not found" });
        await expect(hr().sessions.get("missing")).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe("workspaces", () => {
    it("waits until a released workspace is available again", async () => {
        nock(API)
            .get("/v2/agents/workspaces/w1")
            .reply(200, { workspace: { workspace_id: "w1", state: "RELEASING" } })
            .get("/v2/agents/workspaces/w1")
            .reply(200, { workspace: { workspace_id: "w1", state: "AVAILABLE" } });

        const ws = await hr().workspaces.waitUntilAvailable("w1");
        expect(ws.raw.state).toBe("AVAILABLE");
    });

    it("stops waiting on a failed workspace", async () => {
        nock(API).get("/v2/agents/workspaces/w1").reply(200, { workspace: { workspace_id: "w1", state: "FAILED" } });
        await expect(hr().workspaces.waitUntilAvailable("w1")).rejects.toThrow("cannot become available: FAILED");
    });
});

describe("session exec", () => {
    it("runs a string through sh -c and returns its output", async () => {
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .post("/v2/agents/sessions/s1/sandbox/exec", {
                argv: ["sh", "-c", "wc -l"],
                workdir: "/workspace/app",
                stdin: Buffer.from("a\nb\n").toString("base64"),
                timeout_seconds: 120,
            })
            .reply(200, { exit_code: 0, stdout: "2\n", duration_ms: 7 });

        const s = await hr().sessions.get("s1");
        const r = await s.exec("wc -l", { cwd: "/workspace/app", stdin: "a\nb\n", timeoutMs: 120_000 });
        expect(r).toEqual({ exitCode: 0, stdout: "2\n", stderr: "", truncated: false, durationMs: 7 });
    });

    it("returns a non-zero exit instead of throwing, and reads truncation from the headers", async () => {
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .post("/v2/agents/sessions/s1/sandbox/exec", { argv: ["python3", "-c", "raise SystemExit(2)"] })
            .reply(200, { exit_code: 2, stderr: "boom\n" }, { "X-Exec-Stderr-Truncated": "true" });

        const s = await hr().sessions.get("s1");
        const r = await s.exec(["python3", "-c", "raise SystemExit(2)"]);
        expect(r).toMatchObject({ exitCode: 2, stdout: "", stderr: "boom\n", truncated: true });
    });
});

describe("streamed exec", () => {
    // Frames as the server sends them today; see the contract note in exec.ts.
    const out = (event: "stdout" | "stderr", bytes: Buffer | string) =>
        `event: ${event}\ndata: ${JSON.stringify({ data: Buffer.from(bytes).toString("base64") })}\n\n`;
    const exit = (code: number) => `event: exit\ndata: {"exit_code":${code},"duration_ms":12}\n\n`;
    const ready = () => nock(API).get("/v2/agents/sessions/s1").reply(200, { session: session("s1") });
    const execStream = (body: unknown, frames: string) =>
        nock(API)
            .post("/v2/agents/sessions/s1/sandbox/exec", body as Record<string, unknown>)
            .matchHeader("accept", "text/event-stream")
            .reply(200, frames, { "Content-Type": "text/event-stream" });

    it("streams output through the callbacks and returns the exit", async () => {
        const e = Buffer.from("é"); // two bytes, split across two frames
        ready();
        execStream(
            { argv: ["sh", "-c", "make test"], timeout_seconds: 900 },
            `: keepalive\n\n${out("stdout", "caf")}${out("stdout", e.subarray(0, 1))}${out("stdout", e.subarray(1))}${out("stderr", "warn\n")}${exit(3)}`,
        );

        const s = await hr().sessions.get("s1");
        const seen: string[] = [];
        const r = await s.exec("make test", { timeoutMs: 900_000, onStdout: (t) => seen.push(t) });
        expect(seen.join("")).toBe("café");
        expect(r).toEqual({ exitCode: 3, stdout: "café", stderr: "warn\n", truncated: false, durationMs: 12 });
    });

    it("raises the server's error event", async () => {
        ready();
        execStream({ argv: ["sleep", "999"] }, `event: error\ndata: {"message":"exec timed out"}\n\n`);
        const s = await hr().sessions.get("s1");
        await expect(s.exec(["sleep", "999"], { onStdout: () => undefined })).rejects.toThrow("exec timed out");
    });

    it("does not guess the outcome when the stream ends before the exit", async () => {
        ready();
        execStream({ argv: ["ls"] }, out("stdout", "a\n"));
        const s = await hr().sessions.get("s1");
        await expect(s.exec(["ls"], { onStdout: () => undefined })).rejects.toThrow("its outcome is unknown");
    });

    it("types a refusal before the stream as a RateLimitError", async () => {
        ready();
        nock(API)
            .post("/v2/agents/sessions/s1/sandbox/exec")
            .reply(429, { message: "sandbox exec stream capacity exhausted, retry later" }, { "Retry-After": "1" });
        const s = await hr().sessions.get("s1");
        const err = await s.exec(["ls"], { onStdout: () => undefined }).catch((e) => e);
        expect(err).toBeInstanceOf(RateLimitError);
        expect(err.retryAfter).toBe(1);
    });

    it("spawns a background command without stdin, streaming its output", async () => {
        ready();
        nock(API)
            .post("/v2/agents/sessions/s1/sandbox/exec", (body) => !("keep_stdin_open" in body) && body.argv[2] === "npm run dev")
            .matchHeader("accept", "text/event-stream")
            .reply(200, `${out("stdout", "listening on 3000\n")}${exit(0)}`, { "Content-Type": "text/event-stream" });

        const s = await hr().sessions.get("s1");
        const seen: string[] = [];
        const dev = await s.spawn("npm run dev", { onStdout: (t) => seen.push(t) });
        const r = await dev.wait();
        expect(dev.id).toBeUndefined();
        expect(seen).toEqual(["listening on 3000\n"]);
        expect(r.exitCode).toBe(0);
    });

    it("refuses to write to a command spawned without stdin", async () => {
        ready();
        execStream({ argv: ["sleep", "60"] }, exit(0));
        const s = await hr().sessions.get("s1");
        const proc = await s.spawn(["sleep", "60"]);
        await expect(proc.write("x")).rejects.toThrow("stdin is not open: pass { stdin: true } to spawn");
    });

    describe("spawn with stdin (preview: built to the server's live-stdin plan)", () => {
        const started = `event: started\ndata: {"exec_id":"x1"}\n\n`;
        const stdinPath = "/v2/agents/sessions/s1/sandbox/exec/x1/stdin";

        it("writes stdin in order with the accepted offset, then closes it", async () => {
            const writes: unknown[] = [];
            ready();
            execStream({ argv: ["python3", "-i"], keep_stdin_open: true }, `${started}${out("stdout", "2\n")}${exit(0)}`);
            nock(API)
                .post(stdinPath)
                .times(2)
                .reply(200, (_uri, body) => {
                    const b = body as { data?: string; offset: number; eof?: boolean };
                    writes.push(b);
                    const added = b.data ? Buffer.from(b.data, "base64").length : 0;
                    return { offset: b.offset + added };
                });

            const s = await hr().sessions.get("s1");
            const proc = await s.spawn(["python3", "-i"], { stdin: true });
            await proc.write("print(1 + 1)\n");
            await proc.closeStdin();
            const r = await proc.wait();

            expect(proc.id).toBe("x1");
            expect(writes).toEqual([
                { data: Buffer.from("print(1 + 1)\n").toString("base64"), offset: 0 },
                { eof: true, offset: 13 },
            ]);
            expect(r.stdout).toBe("2\n");
        });

        it("retries a write lost on the network with the same offset", async () => {
            const offsets: number[] = [];
            ready();
            execStream({ argv: ["cat"], keep_stdin_open: true }, `${started}${exit(0)}`);
            nock(API)
                .post(stdinPath)
                .replyWithError("socket hang up")
                .post(stdinPath)
                .reply(200, (_uri, body) => {
                    offsets.push((body as { offset: number }).offset);
                    return { offset: 2 };
                });

            const s = await hr().sessions.get("s1");
            const proc = await s.spawn(["cat"], { stdin: true });
            await proc.write("hi");
            expect(offsets).toEqual([0]);
        });

        it("stops the command when the server returns no exec id", async () => {
            ready();
            execStream({ argv: ["cat"], keep_stdin_open: true }, `${out("stdout", "")}${exit(0)}`);
            const s = await hr().sessions.get("s1");
            await expect(s.spawn(["cat"], { stdin: true })).rejects.toThrow("does not support live stdin yet");
        });

        it("types the old-image refusal as a ConflictError", async () => {
            ready();
            nock(API)
                .post("/v2/agents/sessions/s1/sandbox/exec")
                .reply(409, { message: "this session's template image does not support interactive stdin; create a new session" });
            const s = await hr().sessions.get("s1");
            await expect(s.spawn(["cat"], { stdin: true })).rejects.toBeInstanceOf(ConflictError);
        });
    });
});

describe("session names", () => {
    it("names a session created from an environment, which the API requires", async () => {
        let sent: { name?: string; config_id?: string } = {};
        nock(API)
            .post("/v2/agents/sessions", (body) => ((sent = body), true))
            .reply(201, { session: session("s1") });
        await hr().sessions.create({ environment: { id: "c1", name: "repo agent!", raw: {} } });
        expect(sent.config_id).toBe("c1");
        expect(sent.name).toMatch(/^repo-agent-[a-z0-9]{8}$/);
    });
});

describe("trigger runs", () => {
    it("waits for the latest run to finish and returns its transcript", async () => {
        const T = "/v2/agents/triggers/t1";
        nock(API)
            .get(T)
            .reply(200, { trigger: { trigger_id: "t1", name: "nightly" } })
            .get(`${T}/executions`)
            .reply(200, { executions: [] })
            .get(`${T}/executions`)
            .reply(200, { executions: [{ execution_id: "e1", status: "running" }] })
            .get(`${T}/executions`)
            .reply(200, { executions: [{ execution_id: "e1", status: "succeeded" }] })
            .get(`${T}/executions/e1`)
            .reply(200, { execution: { execution_id: "e1", status: "succeeded", output_text: "all good" } });

        const trigger = await hr().triggers.get("t1");
        const run = await trigger.waitForRun();
        expect(run).toMatchObject({ id: "e1", status: "succeeded", output: "all good" });
    });

    it("stops waiting when the signal aborts", async () => {
        nock(API).get("/v2/agents/triggers/t1").reply(200, { trigger: { trigger_id: "t1", name: "nightly" } });
        const trigger = await hr().triggers.get("t1");
        const stop = new AbortController();
        stop.abort(new Error("interrupted"));
        await expect(trigger.waitForRun({ signal: stop.signal })).rejects.toThrow("interrupted");
    });
});

describe("managed inference key", () => {
    it("can be turned off for a session and an environment", async () => {
        nock(API)
            .post("/v2/agents/sessions") // no query: a request with one would not match
            .reply(201, { session: session("s1") })
            .post("/v2/agents/configs", { name: "byo", manifest_yaml: MANIFEST, manage_model_access_key: false })
            .reply(201, { config: { id: "6f1f0d3e-0000-4000-8000-000000000002", name: "byo" } });
        const client = hr();
        await client.sessions.create({ manifest: MANIFEST, manageModelAccessKey: false });
        const env = await client.environments.create({ name: "byo", manifest: MANIFEST, manageModelAccessKey: false });
        expect(env.name).toBe("byo");
    });

    it("is not minted for a manifest that runs no agent", async () => {
        const scope = nock(API)
            .post("/v2/agents/sessions") // no query
            .reply(201, { session: session("s1") })
            .post("/v2/agents/sessions")
            .reply(201, { session: session("s2") })
            .post("/v2/agents/configs", (body) => body.manage_model_access_key === false)
            .reply(201, { config: { id: "6f1f0d3e-0000-4000-8000-000000000003", name: "box" } });
        const client = hr();
        await client.sessions.create({ manifest: { harness: "sandbox" } });
        await client.sessions.create({ manifest: "# a box\nharness: 'none'\n" });
        await client.environments.create({ name: "box", manifest: "harness: sandbox\n" });
        expect(scope.isDone()).toBe(true);
    });
});

describe("per-command env", () => {
    it("sets env for one command by running it through env", async () => {
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .post("/v2/agents/sessions/s1/sandbox/exec", { argv: ["env", "CI=1", "NODE_ENV=test", "sh", "-c", "npm test"] })
            .reply(200, { exit_code: 0 });
        const s = await hr().sessions.get("s1");
        await s.exec("npm test", { env: { CI: "1", NODE_ENV: "test" } });
    });

    it("rejects a name env would misread, before sending anything", async () => {
        nock(API).get("/v2/agents/sessions/s1").reply(200, { session: session("s1") });
        const s = await hr().sessions.get("s1");
        await expect(s.exec(["ls"], { env: { "A=B": "1" } })).rejects.toThrow('invalid environment variable name: "A=B"');
        await expect(s.exec(["ls"], { env: { "-i": "1" } })).rejects.toThrow("invalid environment variable name");
    });
});

describe("await using", () => {
    it("destroys the session when disposed", async () => {
        let deleted = false;
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .delete("/v2/agents/sessions/s1")
            .reply(204, () => ((deleted = true), ""));
        const s = await hr().sessions.get("s1");
        await s[Symbol.asyncDispose]();
        expect(deleted).toBe(true);
    });

    it("does not fail when the session is already gone", async () => {
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .delete("/v2/agents/sessions/s1")
            .reply(404, { id: "not_found", message: "session not found" });
        const s = await hr().sessions.get("s1");
        await expect(s[Symbol.asyncDispose]()).resolves.toBeUndefined();
    });
});

describe("client", () => {
    it("reads the endpoint from DIGITALOCEAN_API_URL", async () => {
        process.env.DIGITALOCEAN_API_URL = "https://preview.example.com";
        try {
            nock("https://preview.example.com").get("/v2/agents/sessions/s1").reply(200, { session: session("s1") });
            const s = await hr().sessions.get("s1");
            expect(s.id).toBe("s1");
        } finally {
            delete process.env.DIGITALOCEAN_API_URL;
        }
    });
});

describe("session files", () => {
    it("uploads bytes to a path under /workspace", async () => {
        let uploaded = "";
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .post("/v2/agents/sessions/s1/workspace/upload")
            .query({ path: "notes.txt" })
            .reply(function (_uri, body) {
                uploaded = typeof body === "string" ? body : Buffer.from(body as never).toString();
                return [200, { path: "notes.txt", bytes_written: 5 }];
            });

        const s = await hr().sessions.get("s1");
        await s.files.upload("notes.txt", "hello");
        expect(uploaded).toBe("hello");
    });

    it("rejects a download whose checksum does not match", async () => {
        const body = Buffer.concat([Buffer.from("tampered"), footerFor("original")]);
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .get("/v2/agents/sessions/s1/workspace/download")
            .query({ path: "a.txt" })
            .reply(200, body);

        const s = await hr().sessions.get("s1");
        await expect(s.files.download("a.txt")).rejects.toThrow("checksum does not match");
    });

    it("rejects a download that lost its footer", async () => {
        nock(API)
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1") })
            .get("/v2/agents/sessions/s1/workspace/download")
            .query({ path: "a.txt" })
            .reply(200, Buffer.from("cut off"));

        const s = await hr().sessions.get("s1");
        await expect(s.files.download("a.txt")).rejects.toThrow("footer is missing");
    });
});

describe("staged file transfers", () => {
    const T = "/v2/agents/sessions/s1/workspace/transfers";
    const SPACES = "https://spaces.example.com";
    const ready = () => nock(API).get("/v2/agents/sessions/s1").reply(200, { session: session("s1") });
    /** Answers part-upload-urls with a URL per requested part, and records the PUTs. */
    function partStore(times: number) {
        const puts: Record<number, string> = {};
        nock(API)
            .post(`${T}/t1/part-upload-urls`)
            .times(times)
            .reply(200, (_uri, body) => {
                const n = (body as { part_numbers: number[] }).part_numbers[0];
                return { transfer_id: "t1", part_urls: [{ part_number: n, upload_url: `${SPACES}/part/${n}` }] };
            });
        nock(SPACES)
            .put(/\/part\/\d+/)
            .times(times)
            .reply(function (uri, body) {
                puts[Number(uri.split("/").pop())] = String(body);
                return [200];
            });
        return puts;
    }
    const finishes = () =>
        nock(API)
            .get(`${T}/t1`)
            .reply(200, { transfer_id: "t1", status: "in_progress" })
            .get(`${T}/t1`)
            .reply(200, { transfer_id: "t1", status: "completed" });

    it("stages a stream in parts, commits, and waits for the import", async () => {
        ready();
        nock(API)
            .post(T, { direction: "upload", path: "notes.txt" })
            .reply(201, { transfer_id: "t1", part_size: 4, status: "pending" })
            .post(`${T}/t1/commit`)
            .reply(202, { transfer_id: "t1", status: "in_progress" });
        const puts = partStore(3);
        finishes();

        const s = await hr().sessions.get("s1");
        await s.files.upload("notes.txt", new Blob(["hello", " world"]).stream());
        expect(puts).toEqual({ 1: "hell", 2: "o wo", 3: "rld" });
    });

    it("stages a Blob over 50 MiB without reading it whole, sending its size", async () => {
        const size = 50 * 1024 * 1024 + 1;
        let sizeBytes = 0;
        ready();
        nock(API)
            .post(T, (body) => ((sizeBytes = body.size_bytes), body.direction === "upload"))
            .reply(201, { transfer_id: "t1", part_size: 32 * 1024 * 1024 })
            .post(`${T}/t1/commit`)
            .reply(202, {});
        const puts = partStore(2);
        finishes();

        const s = await hr().sessions.get("s1");
        await s.files.upload("big.bin", new Blob([new Uint8Array(size)]));
        expect(sizeBytes).toBe(size);
        expect(Object.keys(puts)).toEqual(["1", "2"]);
    });

    it("retries a part that failed on the server, with a fresh URL", async () => {
        let urls = 0;
        ready();
        nock(API)
            .post(T)
            .reply(201, { transfer_id: "t1", part_size: 1024 })
            .post(`${T}/t1/part-upload-urls`)
            .times(2)
            .reply(200, () => ({ part_urls: [{ part_number: 1, upload_url: `${SPACES}/try/${++urls}` }] }))
            .post(`${T}/t1/commit`)
            .reply(202, {});
        nock(SPACES).put("/try/1").reply(500).put("/try/2").reply(200);
        finishes();

        const s = await hr().sessions.get("s1");
        await s.files.upload("a.txt", new Blob(["abc"]).stream());
        expect(urls).toBe(2);
    });

    it("cancels the transfer when a part is refused", async () => {
        let cancelled = false;
        ready();
        nock(API)
            .post(T)
            .reply(201, { transfer_id: "t1", part_size: 1024 })
            .post(`${T}/t1/part-upload-urls`)
            .reply(200, { part_urls: [{ part_number: 1, upload_url: `${SPACES}/part/1` }] })
            .post(`${T}/t1/cancel`)
            .reply(200, () => ((cancelled = true), { aborted: true }));
        nock(SPACES).put("/part/1").reply(400);

        const s = await hr().sessions.get("s1");
        await expect(s.files.upload("a.txt", new Blob(["abc"]).stream())).rejects.toThrow("uploading part 1 failed (HTTP 400)");
        expect(cancelled).toBe(true);
    });

    /** A download transfer that finishes with `content` and the given checksum. */
    function stagedDownload(content: string, sha256 = createHash("sha256").update(content).digest("hex")) {
        ready();
        nock(API)
            .post(T, { direction: "download", path: "out/results.txt" })
            .reply(202, { transfer_id: "t1", status: "pending" })
            .get(`${T}/t1`)
            .reply(200, { transfer_id: "t1", status: "in_progress" })
            .get(`${T}/t1`)
            .reply(200, { transfer_id: "t1", status: "completed", download_url: `${SPACES}/obj`, sha256 });
        nock(SPACES).get("/obj").reply(200, content);
    }

    it("downloads as a stream through a staged transfer", async () => {
        stagedDownload("all the results");
        const s = await hr().sessions.get("s1");
        const body = await s.files.download("out/results.txt", { format: "stream" });
        expect(await new Response(body).text()).toBe("all the results");
    });

    it("copies to a local file and checks it against the server's checksum", async () => {
        const dir = await mkdtemp(join(tmpdir(), "dots-"));
        stagedDownload("all the results");
        const s = await hr().sessions.get("s1");
        await s.files.copyToLocal("out/results.txt", join(dir, "r.txt"));
        expect(await readFile(join(dir, "r.txt"), "utf8")).toBe("all the results");
    });

    it("deletes a local copy that does not match the checksum", async () => {
        const dir = await mkdtemp(join(tmpdir(), "dots-"));
        stagedDownload("tampered", createHash("sha256").update("original").digest("hex"));
        const s = await hr().sessions.get("s1");
        await expect(s.files.copyToLocal("out/results.txt", join(dir, "r.txt"))).rejects.toThrow("checksum does not match");
        await expect(readFile(join(dir, "r.txt"))).rejects.toThrow();
    });

    it("copies a small local file through the direct path", async () => {
        const dir = await mkdtemp(join(tmpdir(), "dots-"));
        await writeFile(join(dir, "in.txt"), "hello");
        let uploaded = "";
        ready();
        nock(API)
            .post("/v2/agents/sessions/s1/workspace/upload")
            .query({ path: "in.txt" })
            .reply(200, (_uri, body) => ((uploaded = String(body)), { path: "in.txt", bytes_written: 5 }));
        const s = await hr().sessions.get("s1");
        await s.files.copyFromLocal(join(dir, "in.txt"), "in.txt");
        expect(uploaded).toBe("hello");
    });
});

describe("triggers", () => {
    it("keeps the one-time secret when the provider list fails", async () => {
        nock(API)
            .post("/v2/agents/triggers")
            .reply(201, {
                trigger: { trigger_id: "t3", webhook: { provider: "custom", webhook_url: "https://hook" } },
                webhook_secret: "only-once",
            })
            .get("/v2/agents/webhook-providers")
            .reply(500, { message: "boom" });

        const { setup } = await hr().triggers.webhook({
            name: "n",
            provider: "custom",
            manifest: MANIFEST,
            prompt: "p",
        });
        expect(setup.secret).toBe("only-once");
        expect(setup.text).toContain("https://hook");
    });


    it("pauses a trigger by patching its status", async () => {
        nock(API)
            .get("/v2/agents/triggers/t1")
            .reply(200, { trigger: { trigger_id: "t1", status: "active" } })
            .patch("/v2/agents/triggers/t1", { status: "paused" })
            .reply(200, { trigger: { trigger_id: "t1", status: "paused" } });

        const t = await hr().triggers.get("t1");
        await t.pause();
        expect(t.info.status).toBe("paused");
    });
});

/** The footer the server appends to every download. */
function footerFor(payload: string): Buffer {
    return Buffer.from(`DOWSSHA1${createHash("sha256").update(payload).digest("hex")}\n`);
}

function withFooter(payload: string): Buffer {
    return Buffer.concat([Buffer.from(payload), footerFor(payload)]);
}
