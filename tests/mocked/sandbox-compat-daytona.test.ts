/* eslint-disable @typescript-eslint/no-explicit-any -- the vendor signatures use any */
import nock from "nock";
import * as daytona from "../../src/dots/sandbox/compat/daytona/index.js";
import { STUBS } from "../../src/dots/sandbox/compat/daytona/generated.js";
import { NotImplementedError } from "../../src/dots/sandbox/compat/errors.js";

const { DaytonaClient } = daytona;
const API = "https://api.digitalocean.com";
const ID = "sb-1";
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const b64 = (s: string) => Buffer.from(s).toString("base64");
const line = (result: unknown) => JSON.stringify({ result }) + "\n";
const raw = (state = "SANDBOX_STATE_RUNNING", id = ID) => ({
    sandbox_id: id,
    template: "coding-base",
    state,
    size_slug: "mars-2vcpu-4gb",
    created_at: "2026-11-20T12:00:00Z",
});
const client = () => new DaytonaClient({ apiKey: "test-token" });

describe("Daytona compat: client", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => nock.cleanAll());

    it("create from a snapshot name sends the template, env and network setting", async () => {
        api()
            .post("/v2/sandboxes", { template: "mytpl", size_slug: "mars-2vcpu-4gb", env_vars: { A: "1" }, allow_internet_access: false })
            .reply(201, { sandbox: raw() });
        const sb = await client().create({ snapshot: "mytpl", envVars: { A: "1" }, networkBlockAll: true });
        expect(sb).toBeInstanceOf(daytona.Sandbox);
        expect(sb).toMatchObject({ id: ID, snapshot: "coding-base", state: "started", cpu: 2, memory: 4 });
        expect(sb.createdAt).toBe("2026-11-20T12:00:00.000Z");
    });

    it("create with no parameters uses the default template", async () => {
        api().post("/v2/sandboxes", (b) => b.template === "coding-base").reply(201, { sandbox: raw() });
        await client().create();
        expect(nock.isDone()).toBe(true);
    });

    it("create options DigitalOcean cannot honor throw before any request", async () => {
        const d = client();
        for (const p of [{ name: "x" }, { labels: { a: "b" } }, { autoStopInterval: 5 }, { volumes: [] }, { public: true }, { target: "eu" }, { ttlMinutes: 1 }]) {
            await expect(d.create(p as never)).rejects.toThrow(NotImplementedError);
        }
        await expect(d.create({ image: "python:3.12" } as never)).rejects.toThrow(/daytona\.snapshot\.create/);
        expect(nock.pendingMocks()).toHaveLength(0);
    });

    it("a jwtToken without an apiKey is rejected, and client-side options are ignored", async () => {
        expect(() => new DaytonaClient({ jwtToken: "j" })).toThrow(NotImplementedError);
        api().post("/v2/sandboxes").reply(201, { sandbox: raw() });
        await new DaytonaClient({ apiKey: "test-token", apiUrl: "https://app.daytona.io/api", organizationId: "o", requestTimeoutMs: 5, otelEnabled: true }).create();
        expect(nock.isDone()).toBe(true);
    });

    it("get, start, stop and delete use the lifecycle API", async () => {
        const d = client();
        api().get(`/v2/sandboxes/${ID}`).reply(200, { sandbox: raw("SANDBOX_STATE_PAUSED") });
        const sb = await d.get(ID);
        expect(sb.state).toBe("stopped");
        api().post(`/v2/sandboxes/${ID}/resume`).reply(200, { sandbox: raw() });
        await d.start(sb);
        expect(sb.state).toBe("started");
        api().post(`/v2/sandboxes/${ID}/pause`).reply(200, { sandbox: raw("SANDBOX_STATE_PAUSED") });
        await sb.stop();
        expect(sb.state).toBe("stopped");
        api().delete(`/v2/sandboxes/${ID}`).reply(200, {});
        await d.delete(sb);
        expect(nock.isDone()).toBe(true);
    });

    it("list yields sandboxes and filters by state, snapshot and limit", async () => {
        api()
            .get("/v2/sandboxes")
            .reply(200, { sandboxes: [raw(), raw("SANDBOX_STATE_PAUSED", "sb-2"), raw("SANDBOX_STATE_RUNNING", "sb-3")], next_page_token: "" });
        const ids: string[] = [];
        for await (const sb of client().list({ states: ["started" as never], snapshots: ["coding-base"], limit: 1 })) ids.push(sb.id);
        expect(ids).toEqual([ID]);
        expect(() => client().list({ labels: { a: "b" } })).toThrow(NotImplementedError);
        expect(() => client().list({ sort: "name" as never })).toThrow(NotImplementedError);
    });

    it("errors map to Daytona error classes", async () => {
        api().get(`/v2/sandboxes/${ID}`).reply(404, { id: "not_found", message: "nope" });
        const e: any = await client().get(ID).catch((x) => x);
        expect(e).toBeInstanceOf(daytona.DaytonaNotFoundError);
        expect(e.statusCode).toBe(404);
        api().get(`/v2/sandboxes/${ID}`).reply(403, { id: "forbidden", message: "scope" });
        await expect(client().get(ID)).rejects.toBeInstanceOf(daytona.DaytonaForbiddenError);
    });
});

describe("Daytona compat: process", () => {
    afterEach(() => nock.cleanAll());

    it("executeCommand runs through bash -lc and returns the exit code and combined output", async () => {
        api().post("/v2/sandboxes").reply(201, { sandbox: raw() });
        const sb = await client().create();
        api().post(`/v2/sandboxes/${ID}/commands`, { cmd: "bash", args: ["-lc", "ls"], cwd: "/w", env_vars: { A: "1" }, timeout_seconds: "5" }).reply(200, { pid: 7 });
        api().get(`/v2/sandboxes/${ID}/commands/7/stream`).reply(200, line({ stdout: b64("a\n") }) + line({ stderr: b64("warn\n") }) + line({ exit: { exit_code: 3 } }));
        const r = await sb.process.executeCommand("ls", "/w", { A: "1" }, 5);
        expect(r).toEqual({ exitCode: 3, result: "a\nwarn\n" });
    });

    it("sessions, files and the other sandbox services throw NotImplementedError", async () => {
        api().post("/v2/sandboxes").reply(201, { sandbox: raw() });
        const sb = await client().create();
        await expect(sb.process.createSession("s")).rejects.toThrow(NotImplementedError);
        await expect(sb.fs.listFiles("/")).rejects.toThrow(/Daytona: FileSystem.listFiles is not implemented/);
        await expect(sb.git.clone("u", "/p")).rejects.toThrow(NotImplementedError);
        await expect(sb.setLabels({})).rejects.toThrow(NotImplementedError);
    });
});

describe("Daytona compat: snapshot service", () => {
    afterEach(() => nock.cleanAll());
    const tpl = { template_id: "t-1", name: "py", status: "TEMPLATE_STATUS_READY", spec: { image: { registry: "docker.io", repository: "library/python", tag: "3.12" } }, created_at: "2026-11-20T12:00:00Z" };

    it("create builds a template from an image string and waits for it", async () => {
        api().post("/v2/sandboxes/templates", { name: "py", source_oci_ref: "docker.io/library/python:3.12", base_template: "coding-base" }).reply(202, { template: { ...tpl, status: "TEMPLATE_STATUS_PENDING" } });
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl });
        const s: any = await client().snapshot.create({ name: "py", image: "docker.io/library/python:3.12" });
        expect(s).toMatchObject({ id: "t-1", name: "py", state: "active", imageName: "docker.io/library/python:3.12" });
        await expect(client().snapshot.create({ name: "x", image: {} as never })).rejects.toThrow(NotImplementedError);
        await expect(client().snapshot.create({ name: "x", image: "i", resources: { cpu: 1 } })).rejects.toThrow(NotImplementedError);
    });

    it("list, get by name, and delete map to templates", async () => {
        api().get("/v2/sandboxes/templates").query(true).times(3).reply(200, { templates: [tpl], next_page_token: "" });
        const page: any = await client().snapshot.list(1, 10);
        expect(page).toMatchObject({ total: 1, page: 1, totalPages: 1 });
        api().get("/v2/sandboxes/templates/py").reply(404, { id: "not_found", message: "no" });
        const got: any = await client().snapshot.get("py");
        expect(got.id).toBe("t-1");
        api().get("/v2/sandboxes/templates/py").reply(404, { id: "not_found", message: "no" });
        api().delete("/v2/sandboxes/templates/t-1").reply(200, {});
        await client().snapshot.delete("py");
        expect(nock.isDone()).toBe(true);
    });

    it("sandbox.createSnapshot makes a DigitalOcean snapshot", async () => {
        api().post("/v2/sandboxes").reply(201, { sandbox: raw() });
        const sb = await client().create();
        const snap = { snapshot_id: "sn-1", sandbox_id: ID, name: "s1", state: "SNAPSHOT_STATE_COMPLETE", created_at: "2026-11-20T12:00:00Z" };
        api().post(`/v2/sandboxes/${ID}/snapshots`, { name: "s1" }).reply(202, { snapshot: { ...snap, state: "SNAPSHOT_STATE_CREATING" } });
        api().get("/v2/sandboxes/snapshots/sn-1").reply(200, { snapshot: snap });
        await sb.createSnapshot("s1");
        expect(nock.isDone()).toBe(true);
    });
});

describe("Daytona compat: every other member throws NotImplementedError", () => {
    const rows = STUBS.filter(([cls, member]) => !daytona.IMPLEMENTED.has(`${cls}.${member}`));

    it("has stubs to check", () => {
        expect(rows.length).toBeGreaterThan(100);
    });

    it.each(rows.map((r) => [`${r[0] ?? ""}.${r[1]}`, ...r] as const))("%s", async (_label, cls, member, isStatic, kind) => {
        const target: any = cls === null ? daytona : isStatic ? (daytona.CLASSES[cls] as any) : Object.create((daytona.CLASSES[cls] as any).prototype);
        const call = () => (kind === "getter" ? target[member] : target[member]({}, {}, {}));
        let err: any;
        try {
            await call();
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(NotImplementedError);
        expect(err.platform).toBe("Daytona");
        expect(err.message).toContain(cls === null ? member : `${cls}.${member}`);
    });
});
