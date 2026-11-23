/* eslint-disable @typescript-eslint/no-explicit-any -- the vendor signatures use any */
import { createHash } from "node:crypto";
import nock from "nock";
import * as modal from "../../src/dots/sandbox/compat/modal/index.js";
import { STUBS } from "../../src/dots/sandbox/compat/modal/generated.js";
import { NotImplementedError } from "../../src/dots/sandbox/compat/errors.js";

const { ModalClient } = modal;
const API = "https://api.digitalocean.com";
const ID = "sb-1";
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const b64 = (s: string) => Buffer.from(s).toString("base64");
const line = (result: unknown) => JSON.stringify({ result }) + "\n";
const raw = (state = "SANDBOX_STATE_RUNNING", id = ID) => ({
    sandbox_id: id,
    template: "tpl",
    state,
    size_slug: "mars-2vcpu-4gb",
    created_at: "2026-11-20T12:00:00Z",
});
const tpl = (name: string, status = "TEMPLATE_STATUS_READY") => ({ template_id: "t-1", name, status, spec: {}, created_at: "2026-11-20T12:00:00Z" });
const client = () => new ModalClient({ tokenSecret: "test-token" });
let n = 0;
const uniqueTag = () => `docker.io/library/img${++n}:latest`;

/** Mocks the template lookup and build that `images.fromRegistry` needs the first time a tag is used. */
function mockTemplateBuild(tag: string): string {
    const name = `modal-${createHash("sha256").update(tag).digest("hex").slice(0, 16)}`;
    api().get("/v2/sandboxes/templates").query(true).reply(200, { templates: [], next_page_token: "" });
    api().post("/v2/sandboxes/templates", { name, source_oci_ref: tag, base_template: "coding-base" }).reply(202, { template: tpl(name) });
    return name;
}

async function sandbox(params: modal.SandboxCreateParams = {}) {
    const c = client();
    const tag = uniqueTag();
    const template = mockTemplateBuild(tag);
    api().post("/v2/sandboxes", (b) => b.template === template).reply(201, { sandbox: raw() });
    const app = await c.apps.fromName("app", { createIfMissing: true });
    return c.sandboxes.create(app, c.images.fromRegistry(tag), params);
}

describe("Modal compat: sandboxes", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => nock.cleanAll());

    it("create builds a template from the registry image, rounds the size up, and sends env and network settings", async () => {
        const c = client();
        const tag = uniqueTag();
        const template = mockTemplateBuild(tag);
        api()
            .post("/v2/sandboxes", { template, size_slug: "mars-2vcpu-4gb", env_vars: { A: "1", B: "2" }, allow_internet_access: false })
            .reply(201, { sandbox: raw() });
        const secret = await c.secrets.fromObject({ B: "2" });
        const app = await c.apps.fromName("app", { createIfMissing: true });
        const sb = await c.sandboxes.create(app, c.images.fromRegistry(tag), { cpu: 2, memoryMiB: 3000, env: { A: "1" }, secrets: [secret], blockNetwork: true });
        expect(sb).toBeInstanceOf(modal.Sandbox);
        expect(sb.sandboxId).toBe(ID);
        expect(app.name).toBe("app");
        expect(nock.isDone()).toBe(true);
    });

    it("a second sandbox from the same image reuses the template", async () => {
        const c = client();
        const tag = uniqueTag();
        const template = mockTemplateBuild(tag);
        api().post("/v2/sandboxes", (b) => b.template === template).times(2).reply(201, { sandbox: raw() });
        const app = await c.apps.fromName("app");
        const image = c.images.fromRegistry(tag);
        await c.sandboxes.create(app, image);
        await c.sandboxes.create(app, image);
        expect(nock.isDone()).toBe(true);
    });

    it("a size that does not exist is InvalidError; options DigitalOcean cannot honor throw NotImplementedError", async () => {
        const c = client();
        const app = await c.apps.fromName("app");
        const image = c.images.fromRegistry(uniqueTag());
        await expect(c.sandboxes.create(app, image, { cpu: 64 })).rejects.toBeInstanceOf(modal.InvalidError);
        for (const p of [{ tags: { a: "b" } }, { volumes: {} }, { gpu: "A100" }, { timeoutMs: 1000 }, { name: "n" }, { encryptedPorts: [80] }, { pty: true }, { regions: ["x"] }]) {
            await expect(c.sandboxes.create(app, image, p as never)).rejects.toThrow(NotImplementedError);
        }
        expect(nock.pendingMocks()).toHaveLength(0);
    });

    it("fromId, terminate, poll and experimentalPause use the lifecycle API", async () => {
        const c = client();
        api().get(`/v2/sandboxes/${ID}`).reply(200, { sandbox: raw() });
        const sb = await c.sandboxes.fromId(ID);
        api().get(`/v2/sandboxes/${ID}`).reply(200, { sandbox: raw() });
        expect(await sb.poll()).toBeNull();
        api().post(`/v2/sandboxes/${ID}/pause`).reply(200, { sandbox: raw("SANDBOX_STATE_PAUSED") });
        await sb.experimentalPause();
        api().delete(`/v2/sandboxes/${ID}`).reply(200, {});
        await sb.terminate();
        api().get(`/v2/sandboxes/${ID}`).reply(404, { id: "not_found", message: "gone" });
        expect(await sb.poll()).toBe(0);
        api().get(`/v2/sandboxes/nope`).reply(404, { id: "not_found", message: "no" });
        await expect(c.sandboxes.fromId("nope")).rejects.toBeInstanceOf(modal.NotFoundError);
    });

    it("list yields running sandboxes; app and tag filters throw", async () => {
        api().get("/v2/sandboxes").query({ state: "SANDBOX_STATE_RUNNING" }).reply(200, { sandboxes: [raw(), raw("SANDBOX_STATE_RUNNING", "sb-2")], next_page_token: "" });
        const ids: string[] = [];
        for await (const sb of client().sandboxes.list()) ids.push(sb.sandboxId);
        expect(ids).toEqual([ID, "sb-2"]);
        expect(() => client().sandboxes.list({ tags: { a: "b" } })).toThrow(NotImplementedError);
        expect(() => client().sandboxes.list({ appId: "ap-1" })).toThrow(NotImplementedError);
    });

    it("unsupported sandbox members throw NotImplementedError", async () => {
        const sb = await sandbox();
        expect(() => sb.filesystem).toThrow(/Modal: Sandbox.filesystem is not implemented/);
        await expect(sb.tunnels()).rejects.toThrow(NotImplementedError);
        await expect(sb.setTags({})).rejects.toThrow(NotImplementedError);
        await expect(sb.snapshotFilesystem()).rejects.toThrow(NotImplementedError);
    });
});

describe("Modal compat: exec and entrypoint", () => {
    afterEach(() => nock.cleanAll());

    it("exec starts the command and exposes text streams and the exit code", async () => {
        const sb = await sandbox({ workdir: "/w" });
        api().post(`/v2/sandboxes/${ID}/commands`, { cmd: "echo", args: ["hi"], cwd: "/w", env_vars: { A: "1" }, stdin: true, timeout_seconds: "3" }).reply(200, { pid: 7 });
        api().get(`/v2/sandboxes/${ID}/commands/7/stream`).reply(200, line({ stdout: b64("hi\n") }) + line({ stderr: b64("warn") }) + line({ exit: { exit_code: 4 } }));
        const p = await sb.exec(["echo", "hi"], { env: { A: "1" }, timeoutMs: 2500 });
        expect(await p.stdout.readText()).toBe("hi\n");
        expect(await p.stderr.readText()).toBe("warn");
        expect(await p.wait()).toBe(4);
    });

    it("binary mode returns bytes, and stdin writes go to the stdin API", async () => {
        const sb = await sandbox();
        api().post(`/v2/sandboxes/${ID}/commands`, (b) => b.cmd === "cat" && b.stdin === true).reply(200, { pid: 8 });
        api().get(`/v2/sandboxes/${ID}/commands/8/stream`).reply(200, line({ stdout: b64("abc") }) + line({ exit: { exit_code: 0 } }));
        const p = await sb.exec(["cat"], { mode: "binary" });
        api().post(`/v2/sandboxes/${ID}/commands/8/stdin`, { data: b64("in") }).reply(200, {});
        await p.stdin.writeText("in");
        api().post(`/v2/sandboxes/${ID}/commands/8/stdin`, { eof: true }).reply(200, {});
        await p.closeStdin();
        expect(Buffer.from(await p.stdout.readBytes()).toString()).toBe("abc");
        expect(await p.wait()).toBe(0);
    });

    it("exec with pty or an empty command is rejected", async () => {
        const sb = await sandbox();
        await expect(sb.exec(["sh"], { pty: true })).rejects.toThrow(NotImplementedError);
        await expect(sb.exec([])).rejects.toBeInstanceOf(modal.InvalidError);
    });

    it("a sandbox created with command runs it as the entrypoint; wait returns its exit code", async () => {
        const c = client();
        const tag = uniqueTag();
        const template = mockTemplateBuild(tag);
        api().post("/v2/sandboxes", (b) => b.template === template).reply(201, { sandbox: raw() });
        api().post(`/v2/sandboxes/${ID}/commands`, { cmd: "sh", args: ["-c", "echo up"], stdin: true }).reply(200, { pid: 5 });
        api().get(`/v2/sandboxes/${ID}/commands/5/stream`).reply(200, line({ stdout: b64("up\n") }) + line({ exit: { exit_code: 0 } }));
        const sb = await c.sandboxes.create(await c.apps.fromName("a"), c.images.fromRegistry(tag), { command: ["sh", "-c", "echo up"] });
        expect(await sb.stdout.readText()).toBe("up\n");
        expect(await sb.wait()).toBe(0);
    });
});

describe("Modal compat: every other member throws NotImplementedError", () => {
    const rows = STUBS.filter(([cls, member]) => !modal.IMPLEMENTED.has(`${cls}.${member}`));

    it("has stubs to check", () => {
        expect(rows.length).toBeGreaterThan(100);
    });

    it.each(rows.map((r) => [`${r[0] ?? ""}.${r[1]}`, ...r] as const))("%s", async (_label, cls, member, isStatic, kind) => {
        const target: any = cls === null ? modal : isStatic ? (modal.CLASSES[cls] as any) : Object.create((modal.CLASSES[cls] as any).prototype);
        const call = () => (kind === "getter" ? target[member] : target[member]({}, {}, {}));
        let err: any;
        try {
            await call();
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(NotImplementedError);
        expect(err.platform).toBe("Modal");
        expect(err.message).toContain(cls === null ? member : `${cls}.${member}`);
    });
});
