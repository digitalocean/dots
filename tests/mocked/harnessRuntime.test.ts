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
import {
    ConflictError,
    HarnessRuntime,
    NotFoundError,
    SessionFailedError,
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
            .post("/v2/agents/configs", { name: "repo-agent", manifest_yaml: MANIFEST })
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
    it("raises SessionFailedError when the session fails instead of becoming ready", async () => {
        nock(API)
            .post("/v2/agents/sessions")
            .reply(201, { session: session("s1", "SESSION_STATUS_PROVISIONING") })
            .get("/v2/agents/sessions/s1")
            .reply(200, { session: session("s1", "SESSION_STATUS_FAILED") });

        await expect(hr().sessions.create({ environment: "6f1f0d3e-0000-4000-8000-000000000001" })).rejects.toBeInstanceOf(
            SessionFailedError,
        );
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
