import nock from "nock";
import { NotFoundError, Sandbox, SandboxClient, SandboxError, Template } from "../../src/dots/sandbox/index.js";

const API = "https://api.digitalocean.com";
const OPTS = { token: "test-token" };
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const tpl = (status = "TEMPLATE_STATUS_READY", id = "t-1") => ({
    template_id: id,
    name: "my-template",
    status,
    spec: {
        base_template: "coding-base",
        image: { registry: "registry.digitalocean.com", repository: "my-team/my-image", tag: "v1" },
    },
    created_at: "2026-11-20T12:00:00Z",
    updated_at: "2026-11-20T12:05:00Z",
});

describe("Template", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => nock.cleanAll());

    it("create sends name, base template and image, and returns a Template", async () => {
        api()
            .post("/v2/sandboxes/templates", {
                name: "my-template",
                base_template: "coding-base",
                source_oci_ref: "registry.digitalocean.com/my-team/my-image:v1",
            })
            .reply(201, { template: tpl("TEMPLATE_STATUS_PENDING") });
        const t = await Template.create({
            ...OPTS,
            name: "my-template",
            sourceOciRef: "registry.digitalocean.com/my-team/my-image:v1",
        });
        expect(t.templateId).toBe("t-1");
        expect(t.name).toBe("my-template");
        expect(t.status).toBe("TEMPLATE_STATUS_PENDING");
        expect(t.info.baseTemplate).toBe("coding-base");
        expect(t.info.image).toEqual({
            registry: "registry.digitalocean.com",
            repository: "my-team/my-image",
            tag: "v1",
            digest: undefined,
        });
        expect(t.info.createdAt).toBeInstanceOf(Date);
    });

    it("create validates and rejects unsupported options before sending", async () => {
        await expect(Template.create({ ...OPTS, name: "", sourceOciRef: "r" })).rejects.toThrow(/name/);
        await expect(Template.create({ ...OPTS, name: "n", sourceOciRef: " " })).rejects.toThrow(/sourceOciRef/);
        await expect(Template.create({ ...OPTS, name: "n", sourceOciRef: "r", timeoutMs: 5 } as any)).rejects.toThrow(
            /unsupported option timeoutMs/,
        );
    });

    it("update sends only what changed", async () => {
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl() });
        const t = await Template.get("t-1", OPTS);
        api().put("/v2/sandboxes/templates/t-1", { source_oci_ref: "r/i:v2" }).reply(200, { template: tpl("TEMPLATE_STATUS_BUILDING") });
        await t.update({ sourceOciRef: "r/i:v2" });
        expect(t.status).toBe("TEMPLATE_STATUS_BUILDING");
        await expect(t.update({})).rejects.toThrow(/sourceOciRef/);
        expect(nock.isDone()).toBe(true);
    });

    it("delete resolves false when the template is gone", async () => {
        api().delete("/v2/sandboxes/templates/t-1").reply(200, {});
        expect(await Template.delete("t-1", OPTS)).toBe(true);
        api().delete("/v2/sandboxes/templates/gone").reply(404, { id: "not_found", message: "gone" });
        expect(await Template.delete("gone", OPTS)).toBe(false);
    });

    it("get raises a typed error for an unknown template", async () => {
        api().get("/v2/sandboxes/templates/nope").reply(404, { id: "not_found", message: "no such template", request_id: "r" });
        const err = await Template.get("nope", OPTS).catch((e) => e);
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.requestId).toBe("r");
    });

    it("list walks every page and passes the page size", async () => {
        api()
            .get("/v2/sandboxes/templates")
            .query({ page_size: "1" })
            .reply(200, { templates: [tpl("TEMPLATE_STATUS_READY", "a")], next_page_token: "t2" });
        api()
            .get("/v2/sandboxes/templates")
            .query({ page_size: "1", page_token: "t2" })
            .reply(200, { templates: [tpl("TEMPLATE_STATUS_READY", "b")] });
        const ids: string[] = [];
        for await (const t of Template.list({ ...OPTS, limit: 1 })) ids.push(t.templateId);
        expect(ids).toEqual(["a", "b"]);
    });

    it("list exposes one page at a time", async () => {
        api().get("/v2/sandboxes/templates").reply(200, { templates: [tpl()], next_page_token: "t2" });
        const pages = Template.list(OPTS);
        expect(pages.hasNext).toBe(true);
        expect((await pages.nextItems()).map((t) => t.templateId)).toEqual(["t-1"]);
        expect(pages.nextToken).toBe("t2");
    });

    it("builds lists and fetches builds", async () => {
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl() });
        const t = await Template.get("t-1", OPTS);
        const build = {
            build_id: "b-1",
            template_id: "t-1",
            status: "TEMPLATE_BUILD_STATUS_FAILED",
            error: "image not found",
            created_at: "2026-11-20T12:00:00Z",
            updated_at: "2026-11-20T12:01:00Z",
        };
        api().get("/v2/sandboxes/templates/t-1/builds").reply(200, { builds: [build], next_page_token: "" });
        const page = await t.builds().nextItems();
        expect(page).toHaveLength(1);
        expect(page[0]).toMatchObject({ buildId: "b-1", status: "TEMPLATE_BUILD_STATUS_FAILED", error: "image not found" });
        api().get("/v2/sandboxes/templates/t-1/builds/b-1").reply(200, { build });
        expect((await t.build("b-1")).error).toBe("image not found");
        await expect(t.build(" ")).rejects.toThrow(/buildId/);
    });

    it("waitUntilReady polls a building template", async () => {
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl("TEMPLATE_STATUS_BUILDING") });
        const t = await Template.get("t-1", OPTS);
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl("TEMPLATE_STATUS_BUILDING") });
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl() });
        await t.waitUntilReady({ pollIntervalMs: 1 });
        expect(t.status).toBe("TEMPLATE_STATUS_READY");
    });

    it("waitUntilReady explains a failed build with the newest build error", async () => {
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl("TEMPLATE_STATUS_FAILED") });
        const t = await Template.get("t-1", OPTS);
        const failed = (id: string, error: string, updated: string) => ({
            build_id: id,
            template_id: "t-1",
            status: "TEMPLATE_BUILD_STATUS_FAILED",
            error,
            updated_at: updated,
        });
        api()
            .get("/v2/sandboxes/templates/t-1/builds")
            .reply(200, {
                builds: [failed("old", "old error", "2026-11-20T10:00:00Z"), failed("new", "image not found", "2026-11-20T12:00:00Z")],
            });
        await expect(t.waitUntilReady()).rejects.toThrow(/failed to build: image not found/);
    });

    it("waitUntilReady times out", async () => {
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl("TEMPLATE_STATUS_BUILDING") });
        const t = await Template.get("t-1", OPTS);
        api().get("/v2/sandboxes/templates/t-1").times(20).reply(200, { template: tpl("TEMPLATE_STATUS_BUILDING") });
        await expect(t.waitUntilReady({ timeoutMs: 20, pollIntervalMs: 1 })).rejects.toThrow(/not ready in time/);
    });

    it("SandboxClient binds options for templates", async () => {
        api().post("/v2/sandboxes/templates").reply(201, { template: tpl("TEMPLATE_STATUS_PENDING") });
        const t = await new SandboxClient(OPTS).Template.create({ name: "my-template", sourceOciRef: "r/i:v1" });
        expect(t.templateId).toBe("t-1");
    });

    it("a ready template's name creates a sandbox", async () => {
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl() });
        const t = await Template.get("t-1", OPTS);
        api()
            .post("/v2/sandboxes", { template: "my-template", size_slug: "mars-2vcpu-4gb" })
            .reply(201, {
                sandbox: { sandbox_id: "sb-1", template: "my-template", state: "SANDBOX_STATE_RUNNING", size_slug: "mars-2vcpu-4gb", created_at: "2026-11-20T12:00:00Z" },
            });
        const sb = await Sandbox.create({ ...OPTS, template: t.name });
        expect(sb.template).toBe("my-template");
    });
});
