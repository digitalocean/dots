/**
 * The Agent Sandbox spec's surface on the unified Sandbox: Permissions/Bash/Secret/Image/egress on create,
 * `box.agent` as a property, `execStream`, `Trigger`, and the options that are refused because nothing can honor them.
 */
import nock from "nock";
import {
    Agent,
    AgentHandle,
    AuthError,
    Bash,
    BuildError,
    CommandTimeoutError,
    Email,
    ExecStream,
    Image,
    NotSupportedError,
    Permissions,
    Sandbox,
    SandboxError,
    SandboxTimeoutError,
    Secret,
    Slack,
    StateError,
    ConflictError,
    AuthenticationError,
    Trigger,
    UnsupportedError,
} from "../../src/dots/sandbox/index.js";

const API = "https://api.digitalocean.com";
const OPTS = { token: "test-token" };
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const sandboxInfo = (id = "sb-1") => ({ sandbox_id: id, template: "coding-base", state: "SANDBOX_STATE_RUNNING", size_slug: "mars-2vcpu-4gb" });
const sessionInfo = (id = "s1") => ({ session_id: id, sandbox_id: "sb-9", status: "SESSION_STATUS_READY", config_id: "6f1f0d3e-0000-4000-8000-000000000009" });
const CRON = { trigger: { trigger_id: "t1", kind: "cron", name: "n", cron: { cron_expr: "0 9 * * 1-5", timezone: "UTC" } } };

async function createdManifest(opts: Record<string, unknown>): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> = {};
    api()
        .post("/v2/harness-runtime/sessions", (b) => ((body = b), true))
        .query(true)
        .reply(201, { session: sessionInfo() });
    await Sandbox.create({ ...OPTS, ...opts } as never);
    return body;
}

describe("Agent Sandbox spec surface", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_TOKEN;
    });
    afterEach(() => nock.cleanAll());

    describe("Permissions", () => {
        it("emits allow, ask, then deny so that the last matching rule is the strictest", () => {
            const p = new Permissions({ default: "ask", deny: [Bash("rm -rf *")], allow: [Bash("git *"), "file.read"], ask: ["web.fetch"] });
            expect(p.toManifest()).toEqual({
                default: "ask",
                rules: [
                    { tool: "bash", match: { command: "git *" }, action: "allow" },
                    { tool: "file.read", action: "allow" },
                    { tool: "web.fetch", action: "ask" },
                    { tool: "bash", match: { command: "rm -rf *" }, action: "deny" },
                ],
            });
        });

        it("refuses a bad default, an unknown option and an empty pattern", () => {
            expect(() => new Permissions({ default: "maybe" as never })).toThrow(/must be "allow", "ask" or "deny"/);
            expect(() => new Permissions({ block: [] } as never)).toThrow(/unsupported option block/);
            expect(() => Bash(" ")).toThrow(/must not be empty/);
        });
    });

    describe("Sandbox.create({ agent, image, egress, secrets })", () => {
        it("puts the sandbox layer and a Permissions object on the manifest", async () => {
            const body = await createdManifest({
                image: "acme/tools",
                egress: ["github.com", "api.anthropic.com"],
                secrets: { GITHUB_TOKEN: "ghp", SPARE: new Secret("v") },
                agent: new Agent("opencode", {
                    model: "m",
                    secrets: { OPENAI_API_KEY: "k" },
                    permissions: new Permissions({ default: "ask", allow: [Bash("git *")] }),
                }),
            });
            expect(body).toEqual({
                harness: "opencode",
                env: { HARNESS_INFERENCE_MODEL: "m" },
                secrets: { OPENAI_API_KEY: "k", GITHUB_TOKEN: "ghp", SPARE: "v" },
                permissions: { default: "ask", rules: [{ tool: "bash", match: { command: "git *" }, action: "allow" }] },
                template: "acme/tools",
                egress: ["github.com", "api.anthropic.com"],
            });
        });

        it("takes Image.coding() as the default template, and the egress object forms", async () => {
            const body = await createdManifest({ image: Image.coding(), egress: { allow: ["a.com"], allowIps: ["1.2.3.4"] }, agent: { harness: "opencode" } });
            expect(body).toEqual({ harness: "opencode", egress: { allow_hosts: ["a.com"], allow_ips: ["1.2.3.4"] } });
            expect(await createdManifest({ egress: "none", agent: { harness: "opencode" } })).toEqual({ harness: "opencode", egress: "none" });
            expect(await createdManifest({ egress: [], agent: { harness: "opencode" } })).toEqual({ harness: "opencode", egress: [] });
        });

        it.each([
            ["a manifest with image", { manifest: { harness: "opencode" }, image: "x" }, SandboxError, /holds the whole spec/],
            ["a secret in both places", { agent: { harness: "opencode", secrets: { A: "1" } }, secrets: { A: "2" } }, SandboxError, /A is in both/],
            ["egress with both allow and allowHosts", { agent: { harness: "opencode" }, egress: { allow: [], allowHosts: [] } }, SandboxError, /not both/],
            ["a host-bound secret", { agent: { harness: "opencode" }, secrets: { K: new Secret("v", { hosts: ["a.com"] }) } }, UnsupportedError, /bound to hosts/],
            ["an image with builder steps", { agent: { harness: "opencode" }, image: Image.coding().aptInstall("ffmpeg") }, UnsupportedError, /image builder/],
            ["a registry image that was not built", { agent: { harness: "opencode" }, image: Image.fromRegistry("r.io/a@sha256:1") }, UnsupportedError, /built first/],
            ["an environment that does not exist", { agent: { harness: "opencode" }, environment: "browser" }, UnsupportedError, /does not exist yet/],
            ["managed", { agent: { harness: "opencode" }, managed: true }, UnsupportedError, /no managed flag/],
            ["a profile", { agent: { harness: "opencode" }, profile: "p" }, UnsupportedError, /profiles are not built/],
            ["cpu", { agent: { harness: "opencode" }, cpu: 4 }, UnsupportedError, /custom sizes/],
        ])("refuses %s, before any request", async (_label, opts, errorClass, message) => {
            const err = await Sandbox.create({ ...OPTS, ...opts } as never).catch((e) => e);
            expect(err).toBeInstanceOf(errorClass);
            expect(String(err.message)).toMatch(message);
            expect(nock.pendingMocks()).toEqual([]);
        });
    });

    describe("bare Sandbox.create with the spec options", () => {
        it("maps image, egress none and secrets onto the sandbox API", async () => {
            let body: unknown;
            api()
                .post("/v2/sandboxes", (b) => ((body = b), true))
                .reply(201, { sandbox: sandboxInfo() });
            await Sandbox.create({ ...OPTS, image: "acme/tools", egress: "none", secrets: { A: "1", B: new Secret("2") } });
            expect(body).toMatchObject({ template: "acme/tools", allow_internet_access: false, env_vars: { A: "1", B: "2" } });
        });

        it("treats Image.coding() as the default template and egress: unrestricted as open", async () => {
            let body: unknown;
            api()
                .post("/v2/sandboxes", (b) => ((body = b), true))
                .reply(201, { sandbox: sandboxInfo() });
            await Sandbox.create({ ...OPTS, image: Image.coding(), egress: "unrestricted" });
            expect(body).toMatchObject({ template: "coding-base", allow_internet_access: true });
        });

        it.each([
            ["a host allowlist", { egress: ["github.com"] }, UnsupportedError, /no host allowlist/],
            ["a name", { name: "my-sbx" }, UnsupportedError, /no name field/],
            ["a lifetime", { timeout: "30m" }, UnsupportedError, /maximum lifetime/],
            ["image and template", { image: "a", template: "b" }, SandboxError, /`image` or `template`/],
            ["egress and allowInternetAccess", { egress: "none", allowInternetAccess: true }, SandboxError, /not both/],
            ["a secret that is also an env var", { secrets: { A: "1" }, envVars: { A: "2" } }, SandboxError, /in both/],
        ])("refuses %s", async (_label, opts, errorClass, message) => {
            const err = await Sandbox.create({ ...OPTS, ...opts } as never).catch((e) => e);
            expect(err).toBeInstanceOf(errorClass);
            expect(String(err.message)).toMatch(message);
            expect(nock.pendingMocks()).toEqual([]);
        });
    });

    describe("box.agent", () => {
        async function box() {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            return Sandbox.getSession("s1", OPTS);
        }

        it("is a property with the agent calls, and called with no arguments it is the same handle", async () => {
            const b = await box();
            expect(typeof b.agent.run).toBe("function");
            expect(typeof b.agent.events).toBe("function");
            const handle = b.agent();
            expect(handle).toBeInstanceOf(AgentHandle);
            expect(b.agent()).toBe(handle);
        });

        it("refuses to attach an agent after create, and detach", async () => {
            const b = await box();
            expect(() => b.agent("codex", { model: "m" })).toThrow(/attaching an agent after create is not supported/);
            expect(() => b.agent.detach()).toThrow(UnsupportedError);
        });

        it("approve, reject and defer answer a request by id", async () => {
            const b = await box();
            const seen: unknown[] = [];
            api()
                .post("/v2/harness-runtime/sessions/s1/hitl/h1", (x) => (seen.push(x), true))
                .reply(204)
                .post("/v2/harness-runtime/sessions/s1/hitl/h2", (x) => (seen.push(x), true))
                .reply(204);
            await b.agent.approve("h1");
            await b.agent.reject("h2", "no");
            expect(seen).toHaveLength(2);
            expect(nock.isDone()).toBe(true);
        });

        it("the sandbox calls: delete, pauseReason, processes", async () => {
            const b = await box();
            await expect(b.delete({ purgeHistory: true })).rejects.toBeInstanceOf(UnsupportedError);
            api().get("/v2/sandboxes/sb-9/commands").reply(200, { commands: [] });
            expect(await b.processes.list()).toEqual([]); // the sandbox API
            expect(b.pauseReason).toBeUndefined();
            api().delete("/v2/sandboxes/sb-9").reply(204);
            expect(await b.delete()).toBe(true);
        });
    });

    describe("bare sandbox conveniences", () => {
        it("delete({ purgeHistory }) is refused, and delete() kills", async () => {
            api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: sandboxInfo() });
            const sbx = await Sandbox.get("sb-1", OPTS);
            await expect(sbx.delete({ purgeHistory: true })).rejects.toBeInstanceOf(UnsupportedError);
            api().delete("/v2/sandboxes/sb-1").reply(204);
            expect(await sbx.delete()).toBe(true);
        });

        it("processes is the command list", async () => {
            api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: sandboxInfo() });
            const sbx = await Sandbox.get("sb-1", OPTS);
            expect(sbx.processes).toBe(sbx.commands);
            expect(typeof sbx.spawn).toBe("function");
        });
    });

    describe("ExecStream", () => {
        it("yields chunks in order and sets the result after the loop", async () => {
            const stream = new ExecStream<{ exitCode: number; ok: boolean }>(async (on) => {
                on.onStdout("a");
                await new Promise((r) => setTimeout(r, 5));
                on.onStderr("b");
                on.onStdout("c");
                return { exitCode: 0, ok: true };
            });
            const seen: string[] = [];
            for await (const c of stream) seen.push(`${c.stream}:${c.text}`);
            expect(seen).toEqual(["stdout:a", "stderr:b", "stdout:c"]);
            expect(stream.result).toEqual({ exitCode: 0, ok: true });
        });

        it("rethrows the failure at the end of the loop and from wait()", async () => {
            const stream = new ExecStream<{ exitCode: number; ok: boolean }>(async (on) => {
                on.onStdout("x");
                throw new Error("boom");
            });
            const seen: string[] = [];
            await expect(
                (async () => {
                    for await (const c of stream) seen.push(c.text);
                })(),
            ).rejects.toThrow("boom");
            expect(seen).toEqual(["x"]);
            await expect(stream.wait()).rejects.toThrow("boom");
        });
    });

    describe("Image", () => {
        it("chains builder steps without changing the original", () => {
            const base = Image.coding();
            const next = base.aptInstall("ffmpeg").pipInstall("pandas").run("echo hi");
            expect(base.steps).toEqual([]);
            expect(next.steps).toEqual(["apt-install ffmpeg", "pip-install pandas", "run echo hi"]);
            expect(() => Image.fromEnvironment("nope")).toThrow(/unknown environment/);
            expect(() => base.aptInstall()).toThrow(/at least one/);
        });

        it("build refuses anything but a plain registry image", async () => {
            await expect(Image.ubuntu("24.04").build("x", OPTS)).rejects.toBeInstanceOf(UnsupportedError);
            await expect(Image.fromRegistry("r.io/a").aptInstall("x").build("x", OPTS)).rejects.toBeInstanceOf(UnsupportedError);
        });

        it("build creates the template from the registry reference and waits for it", async () => {
            let body: unknown;
            api()
                .post("/v2/sandboxes/templates", (b) => ((body = b), true))
                .reply(201, { template: { template_id: "t1", name: "acme/tools", status: "TEMPLATE_STATUS_READY" } });
            const t = await Image.fromRegistry("r.io/a@sha256:1").build("acme/tools", OPTS);
            expect(body).toMatchObject({ name: "acme/tools", source_oci_ref: "r.io/a@sha256:1", base_template: "coding-base" });
            expect(t.templateId).toBe("t1");
        });

        it("a failed build is a BuildError", async () => {
            api()
                .post("/v2/sandboxes/templates")
                .reply(201, { template: { template_id: "t1", name: "n", status: "TEMPLATE_STATUS_FAILED" } })
                .get("/v2/sandboxes/templates/t1/builds")
                .query(true)
                .reply(200, { builds: [{ build_id: "b", status: "TEMPLATE_BUILD_STATUS_FAILED", error: "no such image" }] });
            const err = await Image.fromRegistry("r.io/a").build("n", OPTS).catch((e) => e);
            expect(err).toBeInstanceOf(BuildError);
            expect(err.message).toMatch(/no such image/);
        });
    });

    describe("Trigger", () => {
        it("Trigger.cron with an Agent starts a fresh session per run", async () => {
            let body: Record<string, unknown> = {};
            api()
                .post("/v2/harness-runtime/triggers", (b) => ((body = b), true))
                .reply(201, CRON);
            const t = await Trigger.cron("0 9 * * 1-5", {
                ...OPTS,
                tz: "America/Los_Angeles",
                agent: new Agent("claude-code", { permissions: new Permissions({ default: "deny", allow: [Bash("git log *")] }) }),
                prompt: "Write a status note",
                output: Email("you@example.com"),
            });
            expect(t.id).toBe("t1");
            expect(body).toMatchObject({
                kind: "cron",
                session_mode: "fresh",
                cron: { cron_expr: "0 9 * * 1-5", timezone: "America/Los_Angeles" },
                output: { mode: "email", email: "you@example.com" },
            });
            expect(String(body.name)).toMatch(/^cron-/);
            expect(JSON.parse(String(body.session_template)).permissions.default).toBe("deny");
        });

        it("Trigger.create with a sandbox binds that session", async () => {
            api().get("/v2/harness-runtime/sessions/s1").reply(200, { session: sessionInfo() });
            const box = await Sandbox.getSession("s1", OPTS);
            let body: Record<string, unknown> = {};
            api()
                .post("/v2/harness-runtime/triggers", (b) => ((body = b), true))
                .reply(201, CRON);
            await Trigger.create({ name: "docs-sync", cron: "0 * * * *", prompt: "Sync", sandbox: box });
            expect(body).toMatchObject({ session_mode: "reuse", bound_session_id: "s1" });
        });

        it("refuses a profile and a bare sandbox, without a request", async () => {
            await expect(Trigger.create({ ...OPTS, name: "n", prompt: "p", cron: "* * * * *", agent: { harness: "opencode" }, profile: "p" } as never)).rejects.toThrow(/profiles are not built/);
            api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: sandboxInfo() });
            const bare = await Sandbox.get("sb-1", OPTS);
            await expect(Trigger.create({ name: "n", prompt: "p", cron: "* * * * *", sandbox: bare as never })).rejects.toThrow(/only bind an agent session/);
            expect(nock.pendingMocks()).toEqual([]);
        });

        it("Email and Slack build the output values", () => {
            expect(Email("a@b.c")).toEqual({ email: "a@b.c" });
            expect(Slack("https://hooks.slack.com/x")).toEqual({ slack: "https://hooks.slack.com/x" });
            expect(() => Email("")).toThrow();
        });
    });

    describe("names and the token", () => {
        it("the spec's error names are the SDK's errors", () => {
            expect(AuthError).toBe(AuthenticationError);
            expect(StateError).toBe(ConflictError);
            expect(NotSupportedError).toBe(UnsupportedError);
            expect(CommandTimeoutError).toBe(SandboxTimeoutError);
        });

        it("reads DIGITALOCEAN_TOKEN when DIGITALOCEAN_ACCESS_TOKEN is not set", async () => {
            process.env.DIGITALOCEAN_TOKEN = "test-token";
            api().post("/v2/sandboxes").reply(201, { sandbox: sandboxInfo() });
            expect((await Sandbox.create()).sandboxId).toBe("sb-1");
        });
    });
});
