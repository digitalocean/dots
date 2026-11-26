/**
 * The unified Sandbox: `create()` is a bare sandbox (sandbox API), `create({ manifest })` is an agent session
 * (harness API). Each kind uses its own API for every call and blocks what it cannot do.
 */
import nock from "nock";
import {
    Agent,
    AgentHandle,
    AgentSandbox,
    CommandError,
    ConflictError,
    NotFoundError,
    Sandbox,
    SandboxClient,
    SandboxError,
    SandboxTimeoutError,
    UnsupportedError,
} from "../../src/dots/sandbox/index.js";

const API = "https://api.digitalocean.com";
const OPTS = { token: "test-token" };
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const AGENT = { harness: "opencode" };
const CFG = "6f1f0d3e-0000-4000-8000-000000000009";

const sandboxInfo = (id = "sb-1") => ({
    sandbox_id: id,
    template: "coding-base",
    state: "SANDBOX_STATE_RUNNING",
    size_slug: "mars-2vcpu-4gb",
    created_at: "2026-11-20T12:00:00Z",
});
const sessionInfo = (id = "s1", extra: Record<string, unknown> = {}) => ({
    session_id: id,
    sandbox_id: "sb-9",
    status: "SESSION_STATUS_READY",
    config_id: CFG,
    ...extra,
});

describe("unified Sandbox", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => nock.cleanAll());

    describe("create", () => {
        it("without a manifest calls the sandbox API and returns a bare Sandbox", async () => {
            api().post("/v2/sandboxes").reply(200, { sandbox: sandboxInfo() });
            const sbx = await Sandbox.create(OPTS);
            expect(sbx.kind).toBe("sandbox");
            expect(sbx.sandboxId).toBe("sb-1");
            expect(nock.isDone()).toBe(true);
        });

        it("with a manifest calls the harness API and returns an AgentSandbox with both ids", async () => {
            let body: unknown;
            api()
                .post("/v2/harness-runtime/sessions", (b) => ((body = b), true))
                .query({ manage_model_access_key: "true" })
                .reply(201, { session: sessionInfo() });
            const box = await Sandbox.create({ ...OPTS, manifest: AGENT });
            expect(box).toBeInstanceOf(AgentSandbox);
            expect(box.kind).toBe("session");
            expect(box.sessionId).toBe("s1");
            expect(box.sandboxId).toBe("sb-9");
            expect(body).toEqual(AGENT);
        });

        it("accepts a manifest written as YAML text", async () => {
            let body: unknown;
            api()
                .post("/v2/harness-runtime/sessions", (b) => ((body = b), true))
                .query(true)
                .reply(201, { session: sessionInfo() });
            await Sandbox.create({ ...OPTS, manifest: "harness: opencode\nmodel: x\n" });
            expect(body).toBe("harness: opencode\nmodel: x\n");
        });

        it.each([
            ["harness: sandbox", { harness: "sandbox" }],
            ["harness: none", "harness: none\n"],
            ["no harness", { model: "x" }],
        ])("refuses a manifest that names no agent (%s), before any request", async (_label, manifest) => {
            await expect(Sandbox.create({ ...OPTS, manifest })).rejects.toThrow(/must name an agent/);
            expect(nock.pendingMocks()).toEqual([]);
        });

        it("with `agent` builds the manifest and calls the harness API", async () => {
            let body: unknown;
            api()
                .post("/v2/harness-runtime/sessions", (b) => ((body = b), true))
                .query({ manage_model_access_key: "true" })
                .reply(201, { session: sessionInfo() });
            const box = await Sandbox.create({
                ...OPTS,
                agent: {
                    harness: "opencode",
                    model: "anthropic-claude-5.5-haiku",
                    env: { LOG_LEVEL: "debug" },
                    secrets: { GITHUB_TOKEN: "t" },
                    permissions: { default: "allow", rules: [{ tool: "bash", action: "ask" }] },
                },
            });
            expect(box.kind).toBe("session");
            expect(body).toEqual({
                harness: "opencode",
                env: { LOG_LEVEL: "debug", HARNESS_INFERENCE_MODEL: "anthropic-claude-5.5-haiku" },
                secrets: { GITHUB_TOKEN: "t" },
                permissions: { default: "allow", rules: [{ tool: "bash", action: "ask" }] },
            });
        });

        it("with `new Agent(harness, options)` sends the same manifest as the object form", async () => {
            const bodies: unknown[] = [];
            for (let i = 0; i < 2; i++) {
                api()
                    .post("/v2/harness-runtime/sessions", (b) => (bodies.push(b), true))
                    .query(true)
                    .reply(201, { session: sessionInfo() });
            }
            const options = { model: "m1", env: { A: "1" }, permissions: { default: "allow" } };
            await Sandbox.create({ ...OPTS, agent: new Agent("opencode", options) });
            await Sandbox.create({ ...OPTS, agent: { harness: "opencode", ...options } });
            expect(bodies[0]).toEqual(bodies[1]);
            expect(bodies[0]).toEqual({ harness: "opencode", env: { A: "1", HARNESS_INFERENCE_MODEL: "m1" }, permissions: { default: "allow" } });
        });

        it("refuses an Agent that names no agent, or has a bad option, before any request", async () => {
            await expect(Sandbox.create({ ...OPTS, agent: new Agent("sandbox") })).rejects.toThrow(/must name an agent/);
            await expect(Sandbox.create({ ...OPTS, agent: new Agent("") })).rejects.toThrow(/`agent.harness` is required/);
            await expect(Sandbox.create({ ...OPTS, agent: new Agent("opencode", { temperature: 1 } as never) })).rejects.toThrow(/unsupported agent option temperature/);
            expect(nock.pendingMocks()).toEqual([]);
        });

        it("with a bare `agent` sends only the harness", async () => {
            let body: unknown;
            api()
                .post("/v2/harness-runtime/sessions", (b) => ((body = b), true))
                .query(true)
                .reply(201, { session: sessionInfo() });
            await Sandbox.create({ ...OPTS, agent: { harness: "claude-code" } });
            expect(body).toEqual({ harness: "claude-code" });
        });

        it.each([
            ["harness: sandbox", { harness: "sandbox" }, /must name an agent/],
            ["no harness", {}, /`agent.harness` is required/],
            ["an unknown agent option", { harness: "opencode", temperature: 1 }, /unsupported agent option temperature/],
            ["model and env.HARNESS_INFERENCE_MODEL", { harness: "opencode", model: "a", env: { HARNESS_INFERENCE_MODEL: "b" } }, /not both/],
            ["an empty model", { harness: "opencode", model: " " }, /must not be empty/],
        ])("refuses `agent` with %s, before any request", async (_label, agent, message) => {
            await expect(Sandbox.create({ ...OPTS, agent } as never)).rejects.toThrow(message);
            expect(nock.pendingMocks()).toEqual([]);
        });

        it("refuses `agent` together with `manifest`, or with bare-sandbox options", async () => {
            await expect(Sandbox.create({ ...OPTS, agent: { harness: "opencode" }, manifest: AGENT } as never)).rejects.toThrow(/`agent` or `manifest`, not both/);
            await expect(Sandbox.create({ ...OPTS, agent: { harness: "opencode" }, size: "x" } as never)).rejects.toThrow(/cannot be combined with size/);
        });

        it("refuses a manifest combined with bare-sandbox options", async () => {
            await expect(Sandbox.create({ ...OPTS, manifest: AGENT, template: "x" } as never)).rejects.toThrow(/cannot be combined with template/);
        });

        it("refuses an option the manifest form does not take", async () => {
            await expect(Sandbox.create({ ...OPTS, manifest: AGENT, nope: 1 } as never)).rejects.toThrow(/unsupported option nope/);
        });

        it("maps harness errors to the sandbox error classes", async () => {
            api().post("/v2/harness-runtime/sessions").query(true).reply(409, { message: "name taken" });
            const err = await Sandbox.create({ ...OPTS, manifest: AGENT }).catch((e) => e);
            expect(err).toBeInstanceOf(ConflictError);
            expect(err).toBeInstanceOf(SandboxError);
        });

        it("goes through SandboxClient with the bound token", async () => {
            const client = new SandboxClient(OPTS);
            api().post("/v2/sandboxes").reply(200, { sandbox: sandboxInfo() });
            expect((await client.Sandbox.create()).kind).toBe("sandbox");
            api().post("/v2/harness-runtime/sessions").query(true).reply(201, { session: sessionInfo() });
            expect((await client.Sandbox.create({ manifest: AGENT })).kind).toBe("session");
        });
    });

    describe("get", () => {
        it("get uses the sandbox API", async () => {
            api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: sandboxInfo() });
            expect((await Sandbox.get("sb-1", OPTS)).kind).toBe("sandbox");
        });

        it("getSession uses the harness API and returns an AgentSandbox", async () => {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            const box = await Sandbox.getSession("s1", OPTS);
            expect(box).toBeInstanceOf(AgentSandbox);
            expect(box.sessionId).toBe("s1");
        });

        it('get with kind "session" uses the harness API only', async () => {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            const box = await Sandbox.get("s1", { ...OPTS, kind: "session" });
            expect(box).toBeInstanceOf(AgentSandbox);
            expect(nock.isDone()).toBe(true);
        });

        it('get with kind "sandbox" is the default and uses the sandbox API', async () => {
            api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: sandboxInfo() });
            expect((await Sandbox.get("sb-1", { ...OPTS, kind: "sandbox" })).kind).toBe("sandbox");
        });

        it("get and list reject an unknown kind, before any request", async () => {
            await expect(Sandbox.get("x", { ...OPTS, kind: "both" } as never)).rejects.toThrow(/`kind` must be/);
            expect(() => Sandbox.list({ ...OPTS, kind: "both" } as never)).toThrow(/`kind` must be/);
        });

        it("getSession raises the sandbox NotFoundError", async () => {
            api().get("/v2/harness-runtime/sessions/nope").reply(404, { message: "no session" });
            await expect(Sandbox.getSession("nope", OPTS)).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe("list", () => {
        it("uses the sandbox API by default", async () => {
            api().get("/v2/sandboxes").reply(200, { sandboxes: [sandboxInfo("a"), sandboxInfo("b")] });
            const ids: string[] = [];
            for await (const s of Sandbox.list(OPTS)) ids.push(s.sandboxId);
            expect(ids).toEqual(["a", "b"]);
        });

        it('with kind "session" uses the harness API only and yields AgentSandboxes', async () => {
            api()
                .get("/v2/harness-runtime/sessions")
                .query(true)
                .reply(200, { sessions: [sessionInfo("s1"), sessionInfo("s2")] });
            const seen: string[] = [];
            for await (const box of Sandbox.list({ ...OPTS, kind: "session" })) {
                expect(box).toBeInstanceOf(AgentSandbox);
                seen.push(box.sessionId);
            }
            expect(seen).toEqual(["s1", "s2"]);
            expect(nock.isDone()).toBe(true);
        });

        it("maps a harness failure to a sandbox error", async () => {
            api().get("/v2/harness-runtime/sessions").query(true).reply(403, { message: "not enabled" });
            const run = async () => {
                for await (const _ of Sandbox.list({ ...OPTS, kind: "session" })) void _;
            };
            await expect(run()).rejects.toBeInstanceOf(SandboxError);
        });

        it("refuses sandbox-only options with kind session, and session-only options without it", async () => {
            expect(() => Sandbox.list({ ...OPTS, kind: "session", state: "SANDBOX_STATE_RUNNING" } as never)).toThrow(/unsupported option state/);
            expect(() => Sandbox.list({ ...OPTS, status: "SESSION_STATUS_READY" } as never)).toThrow(/unsupported option status/);
        });
    });

    describe("a bare sandbox blocks session operations", () => {
        async function bare() {
            api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: sandboxInfo() });
            return Sandbox.get("sb-1", OPTS);
        }

        it("`session` throws UnsupportedError before any request", async () => {
            const sbx = await bare();
            expect(() => sbx.session).toThrow(UnsupportedError);
            expect(() => sbx.session).toThrow(/Sandbox\.create\(\{ manifest \}\)/);
            expect(nock.pendingMocks()).toEqual([]);
        });

        it("`session.send` is a compile error and throws at runtime", async () => {
            const sbx = await bare();
            // @ts-expect-error: a bare sandbox has no session, so there is no send
            expect(() => sbx.session.send("hi")).toThrow(UnsupportedError);
        });

        it("exec stays on the sandbox API", async () => {
            const sbx = await bare();
            api()
                .post("/v2/sandboxes/sb-1/exec")
                .reply(200, JSON.stringify({ result: { stdout: Buffer.from("hi\n").toString("base64") } }) + "\n" + JSON.stringify({ result: { exit: { duration_ms: "1" } } }) + "\n", {
                    "Content-Type": "application/json",
                });
            expect((await sbx.exec("echo hi")).stdout).toBe("hi\n");
        });
    });

    describe("triggers", () => {
        const CRON = { trigger: { trigger_id: "t1", kind: "cron", name: "n", cron: { cron_expr: "0 * * * *", timezone: "UTC" } } };
        const capture = () => {
            const seen: { body?: Record<string, unknown> } = {};
            return { seen, body: (b: Record<string, unknown>) => ((seen.body = b), true) };
        };

        it("Sandbox.trigger with `agent` starts a fresh session per run, from the built manifest", async () => {
            const c = capture();
            api().post("/v2/harness-runtime/triggers", c.body).reply(201, CRON);
            const t = await Sandbox.trigger({
                ...OPTS,
                name: "docs-sync",
                prompt: "Sync the docs",
                cron: "0 * * * *",
                agent: new Agent("opencode", { model: "m", secrets: { OPENAI_API_KEY: "k" } }),
                output: { email: "me@example.com" },
            });
            expect(t.id).toBe("t1");
            expect(c.seen.body).toMatchObject({
                kind: "cron",
                name: "docs-sync",
                session_mode: "fresh",
                prompt_template: "Sync the docs",
                cron: { cron_expr: "0 * * * *", timezone: "UTC" }, // timezone defaults to UTC
                output: { mode: "email", email: "me@example.com" },
            });
            expect(JSON.parse(String(c.seen.body?.session_template))).toEqual({
                harness: "opencode",
                env: { HARNESS_INFERENCE_MODEL: "m" },
                secrets: { OPENAI_API_KEY: "k" },
            });
        });

        it("Sandbox.trigger with a manifest and a webhook returns the handle and the one-time setup", async () => {
            const c = capture();
            api()
                .post("/v2/harness-runtime/triggers", c.body)
                .reply(201, {
                    trigger: { trigger_id: "t2", kind: "webhook", webhook: { provider: "github", webhook_url: "https://hook" } },
                    webhook_secret: "s3cret",
                })
                .get("/v2/harness-runtime/webhook-providers")
                .reply(200, { providers: [{ key: "github", display_name: "GitHub" }] });
            const { trigger, setup } = await Sandbox.trigger({ ...OPTS, name: "pr", prompt: "Review {{payload}}", webhook: "github", manifest: AGENT });
            expect(trigger.id).toBe("t2");
            expect(setup.secret).toBe("s3cret");
            expect(setup.url).toBe("https://hook");
            expect(c.seen.body).toMatchObject({ kind: "webhook", session_mode: "fresh", webhook: { provider: "github" } });
        });

        it.each([
            ["neither cron nor webhook", { name: "n", prompt: "p", agent: AGENT }, /`cron` \(a schedule\) or `webhook`/],
            ["both cron and webhook", { name: "n", prompt: "p", cron: "* * * * *", webhook: "custom", agent: AGENT }, /not both or neither/],
            ["no agent or manifest", { name: "n", prompt: "p", cron: "* * * * *" }, /pass `agent` or `manifest`/],
            ["both agent and manifest", { name: "n", prompt: "p", cron: "* * * * *", agent: AGENT, manifest: AGENT }, /`agent` or `manifest`, not both/],
            ["an agent that runs no agent", { name: "n", prompt: "p", cron: "* * * * *", agent: { harness: "sandbox" } }, /must name an agent/],
            ["a missing name", { prompt: "p", cron: "* * * * *", agent: AGENT }, /`name` is required/],
            ["a bad webhook provider", { name: "n", prompt: "p", webhook: "svn", agent: AGENT }, /must be "github", "gitlab" or "custom"/],
            ["an unknown option", { name: "n", prompt: "p", cron: "* * * * *", agent: AGENT, schedule: "x" }, /unsupported option schedule/],
        ])("Sandbox.trigger refuses %s, before any request", async (_label, opts, message) => {
            await expect(Sandbox.trigger({ ...OPTS, ...opts } as never)).rejects.toThrow(message);
            expect(nock.pendingMocks()).toEqual([]);
        });

        it("Sandbox.trigger maps a harness failure to a sandbox error", async () => {
            api().post("/v2/harness-runtime/triggers").reply(409, { message: "name taken" });
            const err = await Sandbox.trigger({ ...OPTS, name: "n", prompt: "p", cron: "* * * * *", agent: AGENT }).catch((e) => e);
            expect(err).toBeInstanceOf(ConflictError);
        });

        it("box.trigger binds the trigger to the session (reuse mode)", async () => {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            const box = await Sandbox.getSession("s1", OPTS);
            const c = capture();
            api().post("/v2/harness-runtime/triggers", c.body).reply(201, CRON);
            const t = await box.trigger({ name: "n", prompt: "p", cron: "0 9 * * 1-5", timezone: "Asia/Kolkata" });
            expect(t.id).toBe("t1");
            expect(c.seen.body).toMatchObject({
                kind: "cron",
                session_mode: "reuse",
                bound_session_id: "s1",
                cron: { cron_expr: "0 9 * * 1-5", timezone: "Asia/Kolkata" },
            });
            expect(c.seen.body).not.toHaveProperty("session_template");
        });

        it("box.trigger with pause: true pauses the session first", async () => {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            const box = await Sandbox.getSession("s1", OPTS);
            const order: string[] = [];
            api()
                .post("/v2/harness-runtime/sessions/s1/pause")
                .reply(200, () => (order.push("pause"), {}))
                .post("/v2/harness-runtime/triggers")
                .reply(201, () => (order.push("trigger"), CRON));
            await box.trigger({ name: "n", prompt: "p", cron: "* * * * *", pause: true });
            expect(order).toEqual(["pause", "trigger"]);
        });

        it("box.trigger without pause does not pause", async () => {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            const box = await Sandbox.getSession("s1", OPTS);
            api().post("/v2/harness-runtime/triggers").reply(201, CRON);
            await box.trigger({ name: "n", prompt: "p", cron: "* * * * *" });
            expect(nock.isDone()).toBe(true); // no pause interceptor was set, so none was sent
        });

        it("box.trigger refuses a bad request before pausing or sending anything", async () => {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            const box = await Sandbox.getSession("s1", OPTS);
            await expect(box.trigger({ name: "n", prompt: "p", pause: true } as never)).rejects.toThrow(/`cron` \(a schedule\) or `webhook`/);
            await expect(box.trigger({ name: "n", prompt: "p", cron: "* * * * *", manifest: AGENT } as never)).rejects.toThrow(/unsupported option manifest/);
            expect(nock.pendingMocks()).toEqual([]);
        });

        it("a bare sandbox has no trigger", async () => {
            api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: sandboxInfo() });
            const bare = await Sandbox.get("sb-1", OPTS);
            expect((bare as unknown as { trigger?: unknown }).trigger).toBeUndefined();
        });
    });

    describe("an agent session", () => {
        async function agent() {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            return Sandbox.getSession("s1", OPTS);
        }
        const EXEC = "/v2/harness-runtime/sessions/s1/sandbox/exec";

        it("exec goes to the harness API by session id and returns the sandbox result shape", async () => {
            const box = await agent();
            let body: unknown;
            api()
                .post(EXEC, (b) => ((body = b), true))
                .reply(200, { exit_code: 3, stdout: "out\n", stderr: "err\n", duration_ms: 12 });
            const r = await box.exec("exit 3", { cwd: "/tmp", env: { CI: "1" }, timeout: "30s" });
            expect(body).toEqual({ argv: ["sh", "-c", "exit 3"], workdir: "/tmp", env: { CI: "1" }, timeout_seconds: 30 });
            expect(r).toEqual({ exitCode: 3, ok: false, stdout: "out\n", stderr: "err\n", durationMs: 12, truncated: false });
        });

        it("exec honours check", async () => {
            const box = await agent();
            api().post(EXEC).reply(200, { exit_code: 2, stderr: "boom" });
            const err = await box.exec(["false"], { check: true }).catch((e) => e);
            expect(err).toBeInstanceOf(CommandError);
            expect(err.result).toMatchObject({ exitCode: 2, ok: false });
        });

        it("exec maps harness failures to sandbox errors", async () => {
            const box = await agent();
            api().post(EXEC).reply(404, { message: "gone" });
            await expect(box.exec("ls")).rejects.toBeInstanceOf(NotFoundError);
        });

        it("exec refuses `via`, a PTY and conflicting options, without a request", async () => {
            const box = await agent();
            await expect(box.exec("ls", { via: "sandbox" } as never)).rejects.toThrow(/unsupported option via/);
            await expect(box.exec("ls", { env: {}, envVars: {} })).rejects.toThrow(/`env` or `envVars`/);
            expect((box.exec as unknown as { start?: unknown }).start).toBeUndefined(); // no PTY on the harness API
            expect(nock.pendingMocks()).toEqual([]);
        });

        it("agent() is the agent only: cancel goes to the session API and maps the outcome", async () => {
            const box = await agent();
            const handle = box.agent();
            expect(handle).toBeInstanceOf(AgentHandle);
            api().post("/v2/harness-runtime/sessions/s1/cancel").reply(200, { outcome: "acked" });
            expect(await handle.cancel()).toBe("acked");
            api().post("/v2/harness-runtime/sessions/s1/cancel").reply(409, { message: "no active run" });
            expect(await handle.cancel("r1")).toBe("no_turn");
        });

        it("agent() has the agent calls and no sandbox calls", async () => {
            const box = await agent();
            const handle = box.agent() as unknown as Record<string, unknown>;
            for (const name of ["run", "send", "events", "history", "cancel", "resolveApproval"]) expect(typeof handle[name]).toBe("function");
            for (const name of ["exec", "files", "pause", "kill"]) expect(name in handle).toBe(false);
        });

        it("has files and the full session", async () => {
            const box = await agent();
            expect(box.files).toBe(box.session.files);
            expect(typeof box.session.spawn).toBe("function");
        });

        it("kill destroys the session and the saved config, and is false when it is gone", async () => {
            const box = await agent();
            api().delete("/v2/harness-runtime/sessions/s1").reply(204).delete(`/v2/harness-runtime/configs/${CFG}`).reply(204);
            expect(await box.kill()).toBe(true);
            api().delete("/v2/harness-runtime/sessions/s1").reply(404, { message: "gone" });
            expect(await box.kill()).toBe(false);
        });

        it("`await using` kills it at scope exit", async () => {
            api().post("/v2/harness-runtime/sessions").query(true).reply(201, { session: sessionInfo() });
            const scope = api().delete("/v2/harness-runtime/sessions/s1").reply(204).delete(`/v2/harness-runtime/configs/${CFG}`).reply(204);
            {
                await using box = await Sandbox.create({ ...OPTS, manifest: AGENT });
                expect(box.sessionId).toBe("s1");
            }
            expect(scope.isDone()).toBe(true);
        });

        it("pause and resume use the session API", async () => {
            const box = await agent();
            api().post("/v2/harness-runtime/sessions/s1/pause").reply(200, {}).post("/v2/harness-runtime/sessions/s1/resume").reply(200, {});
            await box.pause();
            await box.resume();
            expect(nock.isDone()).toBe(true);
        });

        it("a wait that runs out of time is a SandboxTimeoutError", async () => {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo("s1", { status: "SESSION_STATUS_PROVISIONING" }) });
            const box = await Sandbox.getSession("s1", OPTS);
            api().persist().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo("s1", { status: "SESSION_STATUS_PROVISIONING" }) });
            await expect(box.waitUntilReady({ timeoutMs: 50 })).rejects.toBeInstanceOf(SandboxTimeoutError);
        });
    });
});
