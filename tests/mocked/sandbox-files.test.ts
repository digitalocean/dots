import { createHash } from "node:crypto";
import nock from "nock";
import { stripFooter, transferRetry } from "../../src/dots/sandbox/files.js";
import { NotFoundError, Sandbox, SandboxError, ServiceError } from "../../src/dots/sandbox/index.js";

const API = "https://api.digitalocean.com";
const OPTS = { token: "test-token" };
const ID = "sb-1";
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const withFooter = (payload: Uint8Array | string, digest = sha(payload)) =>
    Buffer.concat([Buffer.from(payload), Buffer.from(`DOWSSHA1${digest}\n`, "latin1")]);
const entry = (over: Record<string, unknown> = {}) => ({
    name: "hello.txt",
    type: "FILE_ENTRY_TYPE_FILE",
    path: "/workspace/hello.txt",
    size: "12",
    mode: 420,
    permissions: "-rw-r--r--",
    owner: "user",
    group: "user",
    modified_time: "2026-03-25T12:00:00Z",
    ...over,
});

async function sandbox(): Promise<Sandbox> {
    api()
        .get(`/v2/sandboxes/${ID}`)
        .reply(200, {
            sandbox: { sandbox_id: ID, template: "coding-base", state: "SANDBOX_STATE_RUNNING", created_at: "2026-11-20T12:00:00Z" },
        });
    return Sandbox.get(ID, OPTS);
}

describe("Sandbox files", () => {
    const delays = transferRetry.delaysMs;
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
        transferRetry.delaysMs = [1, 1, 1];
    });
    afterEach(() => {
        nock.cleanAll();
        transferRetry.delaysMs = delays;
    });

    it("write sends the raw body with its SHA-256 and parses bytes_written", async () => {
        const sb = await sandbox();
        let seen: unknown;
        nock(API, {
            reqheaders: {
                authorization: "Bearer test-token",
                "content-type": "application/octet-stream",
                "x-content-sha256": sha("Hello\n"),
            },
        })
            .post(`/v2/sandboxes/${ID}/files/upload`, (body) => {
                seen = body;
                return true;
            })
            .query({ path: "/workspace/hello.txt" })
            .reply(200, { path: "/workspace/hello.txt", bytes_written: "6" });
        const res = await sb.files.write("/workspace/hello.txt", "Hello\n");
        expect(res).toEqual({ path: "/workspace/hello.txt", bytesWritten: 6 });
        expect(seen).toBe("Hello\n");
        expect(nock.isDone()).toBe(true);
    });

    it("write accepts bytes, an ArrayBuffer and a Blob, and an empty file", async () => {
        const sb = await sandbox();
        const bytes = new Uint8Array([0, 1, 2, 255]);
        // nock hands a binary body over as hex
        nock(API, { reqheaders: { "x-content-sha256": sha(bytes) } })
            .post(`/v2/sandboxes/${ID}/files/upload`, (body) => body === "000102ff")
            .query({ path: "/b" })
            .times(3)
            .reply(200, { path: "/b", bytes_written: "4" });
        await sb.files.write("/b", bytes);
        await sb.files.write("/b", bytes.buffer.slice(0));
        await sb.files.write("/b", new Blob([bytes]));
        // protobuf JSON omits a zero bytes_written
        nock(API, { reqheaders: { "x-content-sha256": sha("") } })
            .post(`/v2/sandboxes/${ID}/files/upload`)
            .query({ path: "/empty" })
            .reply(200, { path: "/empty" });
        expect(await sb.files.write("/empty", "")).toEqual({ path: "/empty", bytesWritten: 0 });
        expect(nock.isDone()).toBe(true);
    });

    it("writeArchive sets is_archive", async () => {
        const sb = await sandbox();
        const tar = new Uint8Array(1024);
        api()
            .post(`/v2/sandboxes/${ID}/files/upload`)
            .query({ path: "/workspace/out", is_archive: "true" })
            .reply(200, { path: "/workspace/out", bytes_written: "1024" });
        expect(await sb.files.writeArchive("/workspace/out", tar)).toEqual({ path: "/workspace/out", bytesWritten: 1024 });
    });

    it("read strips and verifies the footer", async () => {
        const sb = await sandbox();
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/workspace/hello.txt" })
            .reply(200, withFooter("Hello\n"), { "content-type": "application/octet-stream", "x-workspace-size-bytes": "6" });
        const data = await sb.files.read("/workspace/hello.txt");
        expect(data).toBeInstanceOf(Uint8Array);
        expect(Buffer.from(data).toString()).toBe("Hello\n");
    });

    it("readText decodes UTF-8 and handles an empty file", async () => {
        const sb = await sandbox();
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/u" })
            .reply(200, withFooter("héllo ✓"), { "content-type": "application/octet-stream" });
        expect(await sb.files.readText("/u")).toBe("héllo ✓");
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/e" })
            .reply(200, withFooter(""), { "content-type": "application/octet-stream" });
        expect(await sb.files.readText("/e")).toBe("");
    });

    it("readArchive sets as_archive", async () => {
        const sb = await sandbox();
        const tar = Buffer.alloc(512, 7);
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/workspace", as_archive: "true" })
            .reply(200, withFooter(tar), { "content-type": "application/octet-stream", "x-workspace-is-archive": "true" });
        expect(Buffer.from(await sb.files.readArchive("/workspace")).equals(tar)).toBe(true);
    });

    it("read throws on a digest mismatch or a missing footer", async () => {
        const sb = await sandbox();
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/x" })
            .reply(200, withFooter("Hello\n", sha("other")), { "content-type": "application/octet-stream" });
        await expect(sb.files.read("/x")).rejects.toThrow(/integrity check/);
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/x" })
            .reply(200, Buffer.alloc(100, 1), { "content-type": "application/octet-stream" });
        await expect(sb.files.read("/x")).rejects.toThrow(/no integrity footer/);
    });

    it("stripFooter rejects short bodies, a bad digest and a missing newline", async () => {
        await expect(stripFooter(new Uint8Array(10))).rejects.toThrow(SandboxError);
        await expect(stripFooter(Buffer.from(`DOWSSHA1${"Z".repeat(64)}\n`))).rejects.toThrow(/malformed/);
        await expect(stripFooter(Buffer.from(`DOWSSHA1${sha("")}x`))).rejects.toThrow(/no integrity footer/);
        expect((await stripFooter(withFooter(""))).byteLength).toBe(0);
    });

    it("retries a 503 and then succeeds", async () => {
        const sb = await sandbox();
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/r" })
            .times(2)
            .reply(503, { id: "service_unavailable", message: "too many transfers" });
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/r" })
            .reply(200, withFooter("ok"), { "content-type": "application/octet-stream" });
        expect(await sb.files.readText("/r")).toBe("ok");
        expect(nock.isDone()).toBe(true);
    });

    it("gives up after three retries with a ServiceError", async () => {
        const sb = await sandbox();
        api()
            .post(`/v2/sandboxes/${ID}/files/upload`)
            .query({ path: "/r" })
            .times(4)
            .reply(503, { id: "service_unavailable", message: "too many transfers" });
        const err = await sb.files.write("/r", "x").catch((e) => e);
        expect(err).toBeInstanceOf(ServiceError);
        expect(err.status).toBe(503);
        expect(err.message).toBe("too many transfers");
        expect(nock.isDone()).toBe(true);
    });

    it("maps transfer errors to typed errors without retrying", async () => {
        const sb = await sandbox();
        api()
            .get(`/v2/sandboxes/${ID}/files/download`)
            .query({ path: "/missing" })
            .reply(404, { id: "not_found", message: "no such file", request_id: "r1" });
        const err = await sb.files.read("/missing").catch((e) => e);
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.requestId).toBe("r1");
        api().post(`/v2/sandboxes/${ID}/files/upload`).query({ path: "/big" }).reply(413, { id: "too_large", message: "too large" });
        const big = await sb.files.write("/big", "x").catch((e) => e);
        expect(big).toBeInstanceOf(SandboxError);
        expect(big.status).toBe(413);
    });

    it("list maps entries and sends depth", async () => {
        const sb = await sandbox();
        api()
            .get(`/v2/sandboxes/${ID}/files/list`)
            .query({ path: "/workspace", depth: "2" })
            .reply(200, {
                entries: [
                    entry(),
                    entry({ name: "d", type: "FILE_ENTRY_TYPE_DIRECTORY", path: "/workspace/d", size: undefined, mode: 493 }),
                    entry({ name: "l", type: "FILE_ENTRY_TYPE_SYMLINK", path: "/workspace/l", symlink_target: "/workspace/hello.txt" }),
                    { name: "odd", path: "/workspace/odd" },
                ],
            });
        const entries = await sb.files.list("/workspace", { depth: 2 });
        expect(entries.map((e) => e.type)).toEqual(["file", "directory", "symlink", "unspecified"]);
        expect(entries[0]).toEqual({
            name: "hello.txt",
            type: "file",
            path: "/workspace/hello.txt",
            size: 12,
            mode: 420,
            permissions: "-rw-r--r--",
            owner: "user",
            group: "user",
            modifiedTime: new Date("2026-03-25T12:00:00Z"),
            symlinkTarget: undefined,
        });
        expect(entries[1].size).toBe(0);
        expect(entries[2].symlinkTarget).toBe("/workspace/hello.txt");
        expect(entries[3].mode).toBe(0);
    });

    it("list returns [] for an empty directory", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}/files/list`).query({ path: "/empty" }).reply(200, {});
        expect(await sb.files.list("/empty")).toEqual([]);
    });

    it("getInfo returns the entry and raises NotFoundError when missing", async () => {
        const sb = await sandbox();
        api()
            .get(`/v2/sandboxes/${ID}/files/info`)
            .query({ path: "/workspace/hello.txt" })
            .reply(200, { entry: entry({ size: "9007199254740991" }) });
        expect((await sb.files.getInfo("/workspace/hello.txt")).size).toBe(9007199254740991);
        api().get(`/v2/sandboxes/${ID}/files/info`).query({ path: "/nope" }).reply(404, { id: "not_found", message: "no such file" });
        await expect(sb.files.getInfo("/nope")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("exists reads true, and {} as false", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}/files/exists`).query({ path: "/a" }).reply(200, { exists: true });
        api().get(`/v2/sandboxes/${ID}/files/exists`).query({ path: "/b" }).reply(200, {});
        expect(await sb.files.exists("/a")).toBe(true);
        expect(await sb.files.exists("/b")).toBe(false);
    });

    it("makeDir reads created, and an omitted created as false", async () => {
        const sb = await sandbox();
        const dir = entry({ name: "out", type: "FILE_ENTRY_TYPE_DIRECTORY", path: "/workspace/out", size: "0", mode: 493 });
        api().post(`/v2/sandboxes/${ID}/files/make-directory`, { path: "/workspace/out" }).reply(200, { created: true, entry: dir });
        api().post(`/v2/sandboxes/${ID}/files/make-directory`, { path: "/workspace/out" }).reply(200, { entry: dir });
        const first = await sb.files.makeDir("/workspace/out");
        expect(first.created).toBe(true);
        expect(first.entry.type).toBe("directory");
        expect((await sb.files.makeDir("/workspace/out")).created).toBe(false);
    });

    it("move sends source and destination and returns the new entry", async () => {
        const sb = await sandbox();
        api()
            .post(`/v2/sandboxes/${ID}/files/move`, { source: "/workspace/old.txt", destination: "/workspace/new.txt" })
            .reply(200, { entry: entry({ name: "new.txt", path: "/workspace/new.txt" }) });
        const moved = await sb.files.move("/workspace/old.txt", "/workspace/new.txt");
        expect(moved.path).toBe("/workspace/new.txt");
    });

    it("remove posts the path", async () => {
        const sb = await sandbox();
        api().post(`/v2/sandboxes/${ID}/files/remove`, { path: "/workspace/old.txt" }).reply(200, {});
        await expect(sb.files.remove("/workspace/old.txt")).resolves.toBeUndefined();
        expect(nock.isDone()).toBe(true);
    });

    it("validates paths and options before sending", async () => {
        const sb = await sandbox();
        const f = sb.files;
        await expect(f.write("", "x")).rejects.toThrow(/files.write: `path` is required/);
        await expect(f.write("/a", undefined as never)).rejects.toThrow(/data/);
        await expect(f.write("/a", 5 as never)).rejects.toThrow(/data/);
        await expect(f.writeArchive(" ", new Uint8Array())).rejects.toThrow(/dir/);
        await expect(f.writeArchive("/a", "text" as never)).rejects.toThrow(/tar/);
        await expect(f.read(" ")).rejects.toThrow(/path/);
        await expect(f.readText("")).rejects.toThrow(/path/);
        await expect(f.readArchive("")).rejects.toThrow(/path/);
        await expect(f.list("")).rejects.toThrow(/path/);
        await expect(f.list("/a", { depth: -1 })).rejects.toThrow(/depth/);
        await expect(f.list("/a", { depth: 1.5 })).rejects.toThrow(/depth/);
        await expect(f.getInfo("")).rejects.toThrow(/path/);
        await expect(f.exists("")).rejects.toThrow(/path/);
        await expect(f.makeDir("")).rejects.toThrow(/path/);
        await expect(f.move("", "/b")).rejects.toThrow(/source/);
        await expect(f.move("/a", "")).rejects.toThrow(/destination/);
        await expect(f.remove("")).rejects.toThrow(SandboxError);
        await expect(f.list("/a", { recursive: true } as never)).rejects.toThrow(/unsupported option recursive/);
        await expect(f.write("/a", "x", { mode: 1 } as never)).rejects.toThrow(/unsupported option mode/);
        expect(nock.pendingMocks()).toEqual([]);
    });
});
