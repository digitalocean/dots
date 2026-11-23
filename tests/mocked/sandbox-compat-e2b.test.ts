/* eslint-disable @typescript-eslint/no-explicit-any -- the vendor signatures use any */
import nock from "nock";
import * as e2b from "../../src/dots/sandbox/compat/e2b/index.js";
import { STUBS } from "../../src/dots/sandbox/compat/e2b/generated.js";
import { NotImplementedError } from "../../src/dots/sandbox/compat/errors.js";

const { Sandbox, E2bClient, CommandExitError } = e2b;
const API = "https://api.digitalocean.com";
const OPTS = { apiKey: "test-token" };
const ID = "sb-1";
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const b64 = (s: string) => Buffer.from(s).toString("base64");
const line = (result: unknown) => JSON.stringify({ result }) + "\n";
const raw = (state = "SANDBOX_STATE_RUNNING") => ({
    sandbox_id: ID,
    template: "coding-base",
    state,
    size_slug: "mars-2vcpu-4gb",
    created_at: "2026-11-20T12:00:00Z",
});

async function sandbox() {
    api().post("/v2/sandboxes").reply(201, { sandbox: raw() });
    return Sandbox.create(OPTS);
}

describe("E2B compat: Sandbox", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => nock.cleanAll());

    it("create sends template, envs and internet access to the sandboxes API", async () => {
        api()
            .post("/v2/sandboxes", { template: "mytpl", size_slug: "mars-2vcpu-4gb", allow_internet_access: false, env_vars: { A: "1" } })
            .reply(201, { sandbox: raw() });
        const sb = await Sandbox.create("mytpl", { ...OPTS, envs: { A: "1" }, allowInternetAccess: false });
        expect(sb).toBeInstanceOf(Sandbox);
        expect(sb.sandboxId).toBe(ID);
        expect(nock.isDone()).toBe(true);
    });

    it("create with no template uses the default template", async () => {
        api().post("/v2/sandboxes", (b) => b.template === "coding-base").reply(201, { sandbox: raw() });
        await Sandbox.create(OPTS);
        expect(nock.isDone()).toBe(true);
    });

    it("options DigitalOcean cannot honor throw before any request", async () => {
        for (const opts of [{ metadata: { a: "b" } }, { timeoutMs: 1000 }, { cpuCount: 2 }, { volumeMounts: {} }, { network: {} }, { lifecycle: { onTimeout: "kill", autoResume: false } }]) {
            await expect(Sandbox.create({ ...OPTS, ...opts } as never)).rejects.toThrow(NotImplementedError);
        }
        expect(nock.pendingMocks()).toHaveLength(0);
    });

    it("client-side options are ignored and never reach the network", async () => {
        api().post("/v2/sandboxes").reply(201, { sandbox: raw() });
        await Sandbox.create({ ...OPTS, domain: "e2b.example", apiUrl: "https://api.e2b.example", requestTimeoutMs: 5, debug: true, headers: { x: "y" } });
        expect(nock.isDone()).toBe(true);
    });

    it("getInfo maps the sandbox into E2B's shape", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}`).reply(200, { sandbox: raw("SANDBOX_STATE_PAUSED") });
        const info = await sb.getInfo();
        expect(info).toMatchObject({ sandboxId: ID, templateId: "coding-base", state: "paused", cpuCount: 2, memoryMB: 4096, metadata: {} });
        expect(info.startedAt.toISOString()).toBe("2026-11-20T12:00:00.000Z");
    });

    it("pause, kill and isRunning call the lifecycle API", async () => {
        const sb = await sandbox();
        api().post(`/v2/sandboxes/${ID}/pause`).reply(200, { sandbox: raw("SANDBOX_STATE_PAUSED") });
        expect(await sb.pause()).toBe(true);
        api().get(`/v2/sandboxes/${ID}`).reply(200, { sandbox: raw() });
        expect(await sb.isRunning()).toBe(true);
        api().delete(`/v2/sandboxes/${ID}`).reply(200, {});
        expect(await sb.kill()).toBe(true);
        api().delete(`/v2/sandboxes/${ID}`).reply(404, { id: "not_found", message: "gone" });
        expect(await Sandbox.kill(ID, OPTS)).toBe(false);
    });

    it("connect resumes a paused sandbox", async () => {
        api().get(`/v2/sandboxes/${ID}`).reply(200, { sandbox: raw("SANDBOX_STATE_PAUSED") });
        api().post(`/v2/sandboxes/${ID}/resume`).reply(200, { sandbox: raw() });
        const sb = await Sandbox.connect(ID, OPTS);
        expect(sb.sandboxId).toBe(ID);
        expect(nock.isDone()).toBe(true);
    });

    it("list pages through SandboxInfo and applies the default state filter", async () => {
        api()
            .get("/v2/sandboxes")
            .query({ page_size: "5" })
            .reply(200, { sandboxes: [raw(), { ...raw("SANDBOX_STATE_CREATING"), sandbox_id: "sb-2" }], next_page_token: "" });
        const pages = Sandbox.list({ ...OPTS, limit: 5 });
        const items = await pages.nextItems();
        expect(items.map((i) => i.sandboxId)).toEqual([ID]);
        expect(pages.hasNext).toBe(false);
        expect(() => Sandbox.list({ ...OPTS, query: { metadata: { a: "b" } } })).toThrow(NotImplementedError);
    });

    it("a missing sandbox is SandboxNotFoundError and a bad token is AuthenticationError", async () => {
        api().get(`/v2/sandboxes/${ID}`).reply(404, { id: "not_found", message: "no such sandbox" });
        await expect(Sandbox.getInfo(ID, OPTS)).rejects.toBeInstanceOf(e2b.SandboxNotFoundError);
        api().get(`/v2/sandboxes/${ID}`).reply(401, { id: "unauthorized", message: "bad" });
        await expect(Sandbox.getInfo(ID, OPTS)).rejects.toBeInstanceOf(e2b.AuthenticationError);
    });

    it("snapshots map to DigitalOcean snapshots", async () => {
        const sb = await sandbox();
        const snap = { snapshot_id: "sn-1", sandbox_id: ID, name: "s1", state: "SNAPSHOT_STATE_COMPLETE", created_at: "2026-11-20T12:00:00Z" };
        api().post(`/v2/sandboxes/${ID}/snapshots`, { name: "s1" }).reply(202, { snapshot: { ...snap, state: "SNAPSHOT_STATE_CREATING" } });
        api().get("/v2/sandboxes/snapshots/sn-1").reply(200, { snapshot: snap });
        expect(await sb.createSnapshot({ name: "s1" })).toEqual({ snapshotId: "sn-1", names: ["s1"] });
        await expect(sb.createSnapshot({ mode: "filesystem" })).rejects.toThrow(NotImplementedError);
        api().get("/v2/sandboxes/snapshots").query({ sandbox_id: ID }).reply(200, { snapshots: [snap], next_page_token: "" });
        expect(await sb.listSnapshots().nextItems()).toEqual([{ snapshotId: "sn-1", names: ["s1"] }]);
        api().delete("/v2/sandboxes/snapshots/sn-1").reply(200, {});
        expect(await Sandbox.deleteSnapshot("sn-1", OPTS)).toBe(true);
    });

    it("E2bClient binds the key and exposes Sandbox", async () => {
        const client = new E2bClient({ apiKey: "test-token" });
        api().post("/v2/sandboxes").reply(201, { sandbox: raw() });
        const sb = await client.Sandbox.create();
        expect(sb.sandboxId).toBe(ID);
    });
});

describe("E2B compat: Commands", () => {
    afterEach(() => nock.cleanAll());

    it("run executes through bash -l -c and returns stdout, stderr and the exit code", async () => {
        const sb = await sandbox();
        api().post(`/v2/sandboxes/${ID}/commands`, { cmd: "/bin/bash", args: ["-l", "-c", "echo hi"], cwd: "/w", env_vars: { A: "1" }, timeout_seconds: "3" }).reply(200, { pid: 7 });
        api().get(`/v2/sandboxes/${ID}/commands/7/stream`).reply(200, line({ started: { pid: 7 } }) + line({ stdout: b64("hi\n") }) + line({ stderr: b64("warn") }) + line({ exit: { exit_code: 0 } }));
        const seen: string[] = [];
        const r = await sb.commands.run("echo hi", { cwd: "/w", envs: { A: "1" }, timeoutMs: 2500, onStdout: (d) => void seen.push(d) });
        expect(r).toMatchObject({ exitCode: 0, stdout: "hi\n", stderr: "warn" });
        expect(seen).toEqual(["hi\n"]);
    });

    it("a non-zero exit throws CommandExitError with the result", async () => {
        const sb = await sandbox();
        api().post(`/v2/sandboxes/${ID}/commands`).reply(200, { pid: 8 });
        api().get(`/v2/sandboxes/${ID}/commands/8/stream`).reply(200, line({ stdout: b64("out") }) + line({ exit: { exit_code: 2 } }));
        const err: any = await sb.commands.run("false").catch((e) => e);
        expect(err).toBeInstanceOf(CommandExitError);
        expect(err).toMatchObject({ exitCode: 2, stdout: "out" });
    });

    it("background returns a handle; wait collects the result and kill signals the pid", async () => {
        const sb = await sandbox();
        api().post(`/v2/sandboxes/${ID}/commands`).reply(200, { pid: 9 });
        api().get(`/v2/sandboxes/${ID}/commands/9/stream`).reply(200, line({ stdout: b64("x") }) + line({ exit: { exit_code: 0 } }));
        const h = await sb.commands.run("sleep 1", { background: true });
        expect(h.pid).toBe(9);
        expect((await h.wait()).stdout).toBe("x");
        api().post(`/v2/sandboxes/${ID}/commands/9/signal`, { signal: "SANDBOX_COMMAND_SIGNAL_SIGKILL" }).reply(200, {});
        expect(await sb.commands.kill(9)).toBe(true);
        api().post(`/v2/sandboxes/${ID}/commands/10/signal`).reply(404, { id: "not_found", message: "gone" });
        expect(await sb.commands.kill(10)).toBe(false);
    });

    it("list, sendStdin and closeStdin use the commands API", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}/commands`).reply(200, { commands: [{ pid: 3, cmd: "sleep", cwd: "/w" }] });
        expect(await sb.commands.list()).toEqual([{ pid: 3, cmd: "sleep", args: [], envs: {}, cwd: "/w" }]);
        api().post(`/v2/sandboxes/${ID}/commands/3/stdin`, { data: b64("hi") }).reply(200, {});
        await sb.commands.sendStdin(3, "hi");
        api().post(`/v2/sandboxes/${ID}/commands/3/stdin`, { eof: true }).reply(200, {});
        await sb.commands.closeStdin(3);
        expect(nock.isDone()).toBe(true);
    });

    it("the user option throws before any request", async () => {
        const sb = await sandbox();
        await expect(sb.commands.run("id", { user: "root" })).rejects.toThrow(NotImplementedError);
    });
});

describe("E2B compat: Template", () => {
    afterEach(() => nock.cleanAll());
    const tpl = { template_id: "t-1", name: "my-tpl", status: "TEMPLATE_STATUS_READY", spec: { base_template: "coding-base" }, created_at: "2026-11-20T12:00:00Z" };

    it("fromImage then build creates a DigitalOcean template and waits for it", async () => {
        api().post("/v2/sandboxes/templates", { name: "my-tpl", source_oci_ref: "docker.io/library/python:3.12", base_template: "coding-base" }).reply(202, { template: { ...tpl, status: "TEMPLATE_STATUS_PENDING" } });
        api().get("/v2/sandboxes/templates/t-1").reply(200, { template: tpl });
        api().get("/v2/sandboxes/templates/t-1/builds").query(true).reply(200, { builds: [{ build_id: "b-1", template_id: "t-1", status: "TEMPLATE_BUILD_STATUS_SUCCEEDED" }], next_page_token: "" });
        const info = await e2b.Template.build(e2b.Template().fromImage("docker.io/library/python:3.12") as never, "my-tpl", OPTS as never);
        expect(info).toMatchObject({ name: "my-tpl", templateId: "t-1", buildId: "b-1" });
    });

    it("builder steps and builds without an image throw NotImplementedError", async () => {
        const b: any = e2b.Template().fromImage("x");
        expect(() => b.runCmd("ls")).toThrow(NotImplementedError);
        await expect(e2b.Template.build(e2b.Template() as never, "n")).rejects.toThrow(NotImplementedError);
    });
});

describe("E2B compat: every other member throws NotImplementedError", () => {
    const rows = STUBS.filter(([cls, member]) => !e2b.IMPLEMENTED.has(`${cls}.${member}`));

    it("has stubs to check", () => {
        expect(rows.length).toBeGreaterThan(100);
    });

    it.each(rows.map((r) => [`${r[0] ?? ""}.${r[1]}`, ...r] as const))("%s", async (_label, cls, member, isStatic, kind) => {
        const target: any = cls === null ? e2b : isStatic ? (e2b.CLASSES[cls] as any) : Object.create((e2b.CLASSES[cls] as any).prototype);
        const call = () => (kind === "getter" ? target[member] : target[member]({}, {}, {}));
        let err: any;
        try {
            await call();
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(NotImplementedError);
        expect(err.platform).toBe("E2B");
        expect(err.message).toContain(cls === null ? member : `${cls}.${member}`);
        expect(err.message).toContain("is not implemented on DigitalOcean Sandboxes yet: needs ");
    });
});
