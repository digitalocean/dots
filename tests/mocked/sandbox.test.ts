import nock from "nock";
import {
    AuthenticationError,
    ConflictError,
    InvalidRequestError,
    NotFoundError,
    Sandbox,
    SandboxClient,
    SandboxError,
} from "../../src/dots/sandbox/index.js";

const API = "https://api.digitalocean.com";
const OPTS = { token: "test-token" };
const raw = (id: string, state = "SANDBOX_STATE_RUNNING") => ({
    sandbox_id: id,
    template: "coding-base",
    state,
    size_slug: "mars-2vcpu-4gb",
    created_at: "2026-11-20T12:00:00Z",
});
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });

describe("Sandbox", () => {
    const env = process.env;
    beforeEach(() => {
        process.env = { ...env };
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => {
        process.env = env;
        nock.cleanAll();
    });

    it("create sends template, size_slug and options, and returns a Sandbox", async () => {
        api()
            .post("/v2/sandboxes", {
                template: "coding-base",
                size_slug: "s-1vcpu-2gb",
                allow_internet_access: false,
                env_vars: { A: "1" },
            })
            .reply(201, { sandbox: raw("sb-1") });
        const sb = await Sandbox.create({
            ...OPTS,
            template: "coding-base",
            size: "s-1vcpu-2gb",
            allowInternetAccess: false,
            envVars: { A: "1" },
        });
        expect(sb.sandboxId).toBe("sb-1");
        expect(sb.state).toBe("SANDBOX_STATE_RUNNING");
        expect(sb.info.createdAt).toBeInstanceOf(Date);
        expect(nock.isDone()).toBe(true);
    });

    it("create defaults the size", async () => {
        api().post("/v2/sandboxes", { template: "coding-base", size_slug: "mars-2vcpu-4gb" }).reply(201, { sandbox: raw("sb-1") });
        await Sandbox.create({ ...OPTS, template: "coding-base" });
        expect(nock.isDone()).toBe(true);
    });

    it("create defaults the template", async () => {
        api().post("/v2/sandboxes", { template: "coding-base", size_slug: "mars-2vcpu-4gb" }).reply(201, { sandbox: raw("sb-1") });
        await Sandbox.create(OPTS);
        expect(nock.isDone()).toBe(true);
    });

    it("rejects an empty template and unsupported options before sending", async () => {
        await expect(Sandbox.create({ ...OPTS, template: " " })).rejects.toThrow(/template/);
        await expect(Sandbox.create({ ...OPTS, template: "b", timeoutMs: 5 } as any)).rejects.toThrow(/unsupported option timeoutMs/);
        await expect(Sandbox.create({ template: "b" })).rejects.toBeInstanceOf(AuthenticationError);
    });

    it("reads the token from DIGITALOCEAN_ACCESS_TOKEN", async () => {
        process.env.DIGITALOCEAN_ACCESS_TOKEN = "test-token";
        api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: raw("sb-1") });
        await Sandbox.get("sb-1");
        expect(nock.isDone()).toBe(true);
    });

    it("pause, resume and kill", async () => {
        api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: raw("sb-1") });
        const sb = await Sandbox.get("sb-1", OPTS);
        api().post("/v2/sandboxes/sb-1/pause").reply(200, { sandbox: raw("sb-1", "SANDBOX_STATE_PAUSED") });
        expect((await sb.pause()).state).toBe("SANDBOX_STATE_PAUSED");
        api().post("/v2/sandboxes/sb-1/resume").reply(200, { sandbox: raw("sb-1") });
        await sb.resume();
        expect(sb.state).toBe("SANDBOX_STATE_RUNNING");
        api().delete("/v2/sandboxes/sb-1").reply(200, {});
        expect(await sb.kill()).toBe(true);
        expect(nock.isDone()).toBe(true);
    });

    it("kill resolves false when the sandbox is gone", async () => {
        api().delete("/v2/sandboxes/gone").reply(404, { id: "not_found", message: "Sandbox not found for your team." });
        expect(await Sandbox.kill("gone", OPTS)).toBe(false);
    });

    it("connect resumes a paused sandbox", async () => {
        api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: raw("sb-1", "SANDBOX_STATE_PAUSED") });
        api().post("/v2/sandboxes/sb-1/resume").reply(200, { sandbox: raw("sb-1") });
        const sb = await Sandbox.connect("sb-1", OPTS);
        expect(await sb.state).toBe("SANDBOX_STATE_RUNNING");
        expect(nock.isDone()).toBe(true);
    });

    it("list walks every page and passes filters", async () => {
        api()
            .get("/v2/sandboxes")
            .query({ page_size: "1", state: "SANDBOX_STATE_RUNNING" })
            .reply(200, { sandboxes: [raw("a")], next_page_token: "t2" });
        api()
            .get("/v2/sandboxes")
            .query({ page_size: "1", page_token: "t2", state: "SANDBOX_STATE_RUNNING" })
            .reply(200, { sandboxes: [raw("b")] });
        const ids: string[] = [];
        for await (const sb of Sandbox.list({ ...OPTS, limit: 1, state: "SANDBOX_STATE_RUNNING" })) ids.push(sb.sandboxId);
        expect(ids).toEqual(["a", "b"]);
    });

    it("list exposes one page at a time", async () => {
        api().get("/v2/sandboxes").reply(200, { sandboxes: [raw("a")], next_page_token: "t2" });
        const pages = Sandbox.list(OPTS);
        expect(pages.hasNext).toBe(true);
        expect((await pages.nextItems()).map((s) => s.sandboxId)).toEqual(["a"]);
        expect(pages.nextToken).toBe("t2");
    });

    it("maps API errors to typed errors", async () => {
        const body = { id: "not_found", message: "Template not found.", request_id: "req-1" };
        api().post("/v2/sandboxes").reply(404, body);
        const err = await Sandbox.create({ ...OPTS, template: "nope" }).catch((e) => e);
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.status).toBe(404);
        expect(err.requestId).toBe("req-1");
        expect(err.message).toMatch(/Template not found/);

        api().post("/v2/sandboxes/sb-1/pause").reply(400, { id: "bad_request", message: "cannot be paused" });
        await expect(Sandbox.pause("sb-1", OPTS)).rejects.toBeInstanceOf(InvalidRequestError);
        api().post("/v2/sandboxes").reply(409, { id: "conflict", message: "x" });
        await expect(Sandbox.create({ ...OPTS, template: "b" })).rejects.toBeInstanceOf(ConflictError);
        api().get("/v2/sandboxes/x").reply(401, { id: "unauthorized", message: "no" });
        await expect(Sandbox.get("x", OPTS)).rejects.toBeInstanceOf(AuthenticationError);
        expect(new NotFoundError("m")).toBeInstanceOf(SandboxError);
    });

    it("SandboxClient binds options", async () => {
        api().post("/v2/sandboxes").reply(201, { sandbox: raw("sb-1") });
        const sb = await new SandboxClient(OPTS).Sandbox.create({ template: "coding-base" });
        expect(sb.sandboxId).toBe("sb-1");
    });

    it("waitUntilRunning polls a creating sandbox", async () => {
        api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: raw("sb-1", "SANDBOX_STATE_CREATING") });
        const sb = await Sandbox.get("sb-1", OPTS);
        api().get("/v2/sandboxes/sb-1").reply(200, { sandbox: raw("sb-1") });
        await sb.waitUntilRunning({ pollIntervalMs: 1 });
        expect(sb.state).toBe("SANDBOX_STATE_RUNNING");
    });
});
