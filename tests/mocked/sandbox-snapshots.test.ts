import nock from "nock";
import { NotFoundError, Sandbox, SandboxClient, SandboxError, Snapshot } from "../../src/dots/sandbox/index.js";

const API = "https://api.digitalocean.com";
const OPTS = { token: "test-token" };
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const snap = (state = "SNAPSHOT_STATE_COMPLETE", id = "snap-1") => ({
    snapshot_id: id,
    sandbox_id: "sb-1",
    name: "my-snapshot",
    state,
    size_bytes: "1073741824",
    created_at: "2026-11-20T12:00:00Z",
    ttl: "168h",
});

describe("Snapshot", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => nock.cleanAll());

    it("create sends name and ttl and returns a Snapshot in CREATING", async () => {
        api()
            .post("/v2/sandboxes/sb-1/snapshots", { name: "my-snapshot", ttl: "168h" })
            .reply(202, { snapshot: snap("SNAPSHOT_STATE_CREATING") });
        const s = await Snapshot.create("sb-1", { ...OPTS, name: "my-snapshot", ttl: "168h" });
        expect(s.snapshotId).toBe("snap-1");
        expect(s.sandboxId).toBe("sb-1");
        expect(s.name).toBe("my-snapshot");
        expect(s.state).toBe("SNAPSHOT_STATE_CREATING");
        expect(s.info.ttl).toBe("168h");
        expect(s.info.sizeBytes).toBe("1073741824");
        expect(s.info.createdAt).toBeInstanceOf(Date);
    });

    it("create accepts a 200 reply and an empty body", async () => {
        api().post("/v2/sandboxes/sb-1/snapshots", {}).reply(200, { snapshot: snap("SNAPSHOT_STATE_UPLOADING") });
        const s = await Snapshot.create("sb-1", OPTS);
        expect(s.state).toBe("SNAPSHOT_STATE_UPLOADING");
    });

    it("create validates the name and rejects unsupported options before sending", async () => {
        for (const name of ["", "Upper", "has space", "under_score", "a".repeat(64)]) {
            await expect(Snapshot.create("sb-1", { ...OPTS, name })).rejects.toThrow(/name/);
        }
        await expect(Snapshot.create("sb-1", { ...OPTS, ttl: " " })).rejects.toThrow(/ttl/);
        await expect(Snapshot.create(" ", OPTS)).rejects.toThrow(/sandboxId/);
        await expect(Snapshot.create("sb-1", { ...OPTS, timeoutMs: 5 } as any)).rejects.toThrow(
            /unsupported option timeoutMs/,
        );
        expect(nock.pendingMocks()).toEqual([]);
    });

    it("name accepts 1 and 63 characters of lowercase letters, digits and hyphens", async () => {
        api().post("/v2/sandboxes/sb-1/snapshots").times(2).reply(202, { snapshot: snap("SNAPSHOT_STATE_CREATING") });
        await Snapshot.create("sb-1", { ...OPTS, name: "a" });
        await Snapshot.create("sb-1", { ...OPTS, name: "a-9".repeat(21) });
        expect(nock.isDone()).toBe(true);
    });

    it("sandbox.createSnapshot reuses the sandbox connection", async () => {
        api()
            .post("/v2/sandboxes")
            .reply(201, {
                sandbox: { sandbox_id: "sb-1", template: "coding-base", state: "SANDBOX_STATE_RUNNING", created_at: "2026-11-20T12:00:00Z" },
            });
        const sb = await Sandbox.create(OPTS);
        api().post("/v2/sandboxes/sb-1/snapshots", { name: "before" }).reply(202, { snapshot: snap("SNAPSHOT_STATE_CREATING") });
        const s = await sb.createSnapshot({ name: "before" });
        expect(s.sandboxId).toBe("sb-1");
        await expect(sb.createSnapshot({ name: "BAD" })).rejects.toThrow(/sandbox.createSnapshot: `name`/);
    });

    it("create raises a typed error when the sandbox is unknown", async () => {
        api().post("/v2/sandboxes/nope/snapshots").reply(404, { id: "not_found", message: "no sandbox", request_id: "r" });
        const err = await Snapshot.create("nope", OPTS).catch((e) => e);
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.status).toBe(404);
    });

    it("get returns the snapshot and raises NotFoundError for an unknown id", async () => {
        api().get("/v2/sandboxes/snapshots/snap-1").reply(200, { snapshot: snap() });
        const s = await Snapshot.get("snap-1", OPTS);
        expect(s.state).toBe("SNAPSHOT_STATE_COMPLETE");
        api().get("/v2/sandboxes/snapshots/nope").reply(404, { id: "not_found", message: "no snapshot", request_id: "r" });
        await expect(Snapshot.get("nope", OPTS)).rejects.toBeInstanceOf(NotFoundError);
        await expect(Snapshot.get("", OPTS)).rejects.toBeInstanceOf(SandboxError);
    });

    it("delete resolves false when the snapshot is gone", async () => {
        api().delete("/v2/sandboxes/snapshots/snap-1").reply(200, {});
        expect(await Snapshot.delete("snap-1", OPTS)).toBe(true);
        api().delete("/v2/sandboxes/snapshots/gone").reply(404, { id: "not_found", message: "gone" });
        expect(await Snapshot.delete("gone", OPTS)).toBe(false);
    });

    it("instance delete uses the snapshot id", async () => {
        api().get("/v2/sandboxes/snapshots/snap-1").reply(200, { snapshot: snap() });
        const s = await Snapshot.get("snap-1", OPTS);
        api().delete("/v2/sandboxes/snapshots/snap-1").reply(200, {});
        expect(await s.delete()).toBe(true);
    });

    it("list walks every page, filters by sandbox and passes the page size", async () => {
        api()
            .get("/v2/sandboxes/snapshots")
            .query({ sandbox_id: "sb-1", page_size: "1" })
            .reply(200, { snapshots: [snap("SNAPSHOT_STATE_COMPLETE", "a")], next_page_token: "t2" });
        api()
            .get("/v2/sandboxes/snapshots")
            .query({ sandbox_id: "sb-1", page_size: "1", page_token: "t2" })
            .reply(200, { snapshots: [snap("SNAPSHOT_STATE_COMPLETE", "b")] });
        const ids: string[] = [];
        for await (const s of Snapshot.list({ ...OPTS, sandboxId: "sb-1", limit: 1 })) ids.push(s.snapshotId);
        expect(ids).toEqual(["a", "b"]);
    });

    it("list exposes one page at a time and is lazy", async () => {
        const pages = Snapshot.list(OPTS);
        expect(nock.pendingMocks()).toEqual([]);
        api().get("/v2/sandboxes/snapshots").reply(200, { snapshots: [snap()], next_page_token: "t2" });
        const first = await pages.nextItems();
        expect(first).toHaveLength(1);
        expect(pages.hasNext).toBe(true);
        expect(pages.nextToken).toBe("t2");
    });

    it("list rejects unsupported options", () => {
        expect(() => Snapshot.list({ ...OPTS, state: "x" } as any)).toThrow(/unsupported option state/);
    });

    it("waitUntilReady polls a snapshot until it is complete", async () => {
        api().get("/v2/sandboxes/snapshots/snap-1").reply(200, { snapshot: snap("SNAPSHOT_STATE_CREATING") });
        const s = await Snapshot.get("snap-1", OPTS);
        api().get("/v2/sandboxes/snapshots/snap-1").reply(200, { snapshot: snap("SNAPSHOT_STATE_UPLOADING") });
        api().get("/v2/sandboxes/snapshots/snap-1").reply(200, { snapshot: snap() });
        await s.waitUntilReady({ pollIntervalMs: 1 });
        expect(s.state).toBe("SNAPSHOT_STATE_COMPLETE");
    });

    it("waitUntilReady raises the error message of a failed snapshot", async () => {
        api()
            .get("/v2/sandboxes/snapshots/snap-1")
            .reply(200, { snapshot: { ...snap("SNAPSHOT_STATE_CREATING"), size_bytes: undefined } });
        const s = await Snapshot.get("snap-1", OPTS);
        api()
            .get("/v2/sandboxes/snapshots/snap-1")
            .reply(200, { snapshot: { ...snap("SNAPSHOT_STATE_FAILED"), error_message: "disk full" } });
        await expect(s.waitUntilReady({ pollIntervalMs: 1 })).rejects.toThrow(/snapshot snap-1 failed: disk full/);
    });

    it("waitUntilReady times out", async () => {
        api().get("/v2/sandboxes/snapshots/snap-1").reply(200, { snapshot: snap("SNAPSHOT_STATE_CREATING") });
        const s = await Snapshot.get("snap-1", OPTS);
        api().get("/v2/sandboxes/snapshots/snap-1").times(20).reply(200, { snapshot: snap("SNAPSHOT_STATE_CREATING") });
        await expect(s.waitUntilReady({ timeoutMs: 20, pollIntervalMs: 1 })).rejects.toThrow(/not complete in time/);
    });

    it("SandboxClient binds options for snapshots", async () => {
        api().post("/v2/sandboxes/sb-1/snapshots").reply(202, { snapshot: snap("SNAPSHOT_STATE_CREATING") });
        const s = await new SandboxClient(OPTS).Snapshot.create("sb-1", { name: "x" });
        expect(s.snapshotId).toBe("snap-1");
    });
});
