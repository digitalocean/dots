/**
 * Sandbox snapshots: `/v2/sandboxes/{sandbox_id}/snapshots` and `/v2/sandboxes/snapshots`.
 *
 * A snapshot captures a ready or paused sandbox. It is created asynchronously:
 * create returns at once in the `CREATING` state, so wait until it is complete.
 *
 * ```ts
 * const snapshot = await sandbox.createSnapshot({ name: "before-upgrade", ttl: "168h" });
 * await snapshot.waitUntilReady();
 * for await (const s of Snapshot.list({ sandboxId: sandbox.sandboxId })) console.log(s.name, s.state);
 * await snapshot.delete();
 * ```
 */

import type { Snapshot as SnapshotModel, Snapshot_state } from "../models/index.js";
import { connect, rejectUnknownOptions, type ClientOptions, type Connection } from "./config.js";
import { call, NotFoundError, required, SandboxError, SandboxTimeoutError } from "./errors.js";
import { Pages } from "./pages.js";

/** The state of a snapshot. */
export type SnapshotState = Snapshot_state;

/** A snapshot record as the API last returned it. */
export interface SnapshotInfo {
    snapshotId: string;
    /** The sandbox the snapshot was taken from. */
    sandboxId: string;
    /** The name given at creation, if any. */
    name?: string;
    state: SnapshotState;
    /** The size in bytes, as a decimal string. Set when the snapshot is complete. */
    sizeBytes?: string;
    createdAt?: Date;
    /** Why the snapshot failed. Set when the state is failed. */
    errorMessage?: string;
    /** How long the snapshot is kept, such as `168h`. Unset when the platform default applies. */
    ttl?: string;
}

export interface SnapshotCreateOptions {
    /** An optional name: 1 to 63 characters, lowercase letters, digits and hyphens. */
    name?: string;
    /** How long to keep the snapshot, such as `168h`. When unset, the platform default applies. */
    ttl?: string;
}

export interface SnapshotListOptions extends ClientOptions {
    /** Return only the snapshots of this sandbox. */
    sandboxId?: string;
    /** Page size. */
    limit?: number;
    /** Resume after the `nextToken` of an earlier page. */
    nextToken?: string;
}

export interface SnapshotWaitOptions {
    /** Defaults to 5 minutes. */
    timeoutMs?: number;
    /** Defaults to 2 s. */
    pollIntervalMs?: number;
}

const CREATE_KEYS = ["name", "ttl"];
const LIST_KEYS = ["sandboxId", "limit", "nextToken"];
const NAME_PATTERN = /^[a-z0-9-]{1,63}$/;

export function toSnapshotInfo(m: SnapshotModel | null | undefined): SnapshotInfo {
    if (!m?.snapshotId) throw new SandboxError("the API response did not include the snapshot");
    return {
        snapshotId: m.snapshotId,
        sandboxId: m.sandboxId ?? "",
        name: m.name || undefined,
        state: m.state ?? "SNAPSHOT_STATE_UNSPECIFIED",
        sizeBytes: m.sizeBytes || undefined,
        createdAt: m.createdAt ?? undefined,
        errorMessage: m.errorMessage || undefined,
        ttl: m.ttl || undefined,
    };
}

function checkCreateOptions(opts: SnapshotCreateOptions, where: string): void {
    rejectUnknownOptions(opts, CREATE_KEYS, where);
    if (opts.name !== undefined && !NAME_PATTERN.test(opts.name)) {
        throw new SandboxError(
            `${where}: \`name\` must be 1 to 63 characters: lowercase letters, digits and hyphens`,
        );
    }
    if (opts.ttl !== undefined && !opts.ttl.trim()) {
        throw new SandboxError(`${where}: \`ttl\` must not be empty`);
    }
}

/** Starts a snapshot of a sandbox on an open connection. @internal */
export async function createSnapshot(
    conn: Connection,
    sandboxId: string,
    opts: SnapshotCreateOptions,
    where: string,
): Promise<Snapshot> {
    checkCreateOptions(opts, where);
    if (!sandboxId?.trim()) throw new SandboxError(`${where}: \`sandboxId\` is required`);
    const res = await call(() =>
        conn.client.v2.sandboxes.bySandbox_id(sandboxId).snapshots.post({
            name: opts.name,
            ttl: opts.ttl,
        }),
    );
    return Snapshot.fromInfo(conn, toSnapshotInfo(res?.snapshot));
}

export class Snapshot {
    /** The record as last returned by the API. Call {@link refresh} to update it. */
    info: SnapshotInfo;

    private constructor(
        private readonly conn: Connection,
        info: SnapshotInfo,
    ) {
        this.info = info;
    }

    /** @internal */
    static fromInfo(conn: Connection, info: SnapshotInfo): Snapshot {
        return new Snapshot(conn, info);
    }

    get snapshotId(): string {
        return this.info.snapshotId;
    }
    get sandboxId(): string {
        return this.info.sandboxId;
    }
    get name(): string | undefined {
        return this.info.name;
    }
    get state(): SnapshotState {
        return this.info.state;
    }

    /**
     * Starts a snapshot of a ready or paused sandbox. Resolves as soon as the
     * snapshot is accepted, in the `CREATING` state: call {@link waitUntilReady}.
     */
    static async create(
        sandboxId: string,
        opts: SnapshotCreateOptions & ClientOptions = {},
    ): Promise<Snapshot> {
        rejectUnknownOptions(opts, CREATE_KEYS, "Snapshot.create");
        return createSnapshot(connect(opts), sandboxId, { name: opts.name, ttl: opts.ttl }, "Snapshot.create");
    }

    /** Fetches a snapshot by id. */
    static async get(snapshotId: string, opts: ClientOptions = {}): Promise<Snapshot> {
        const conn = connect(opts);
        return new Snapshot(conn, await fetchSnapshot(conn, snapshotId));
    }

    /** Lists your team's snapshots, newest first. Pass `sandboxId` to list one sandbox's snapshots. */
    static list(opts: SnapshotListOptions = {}): Pages<Snapshot> {
        rejectUnknownOptions(opts, LIST_KEYS, "Snapshot.list");
        const conn = connect(opts);
        return new Pages<Snapshot>(async (token) => {
            const res = await call(() =>
                conn.client.v2.sandboxes.snapshots.get({
                    queryParameters: { sandboxId: opts.sandboxId, pageSize: opts.limit, pageToken: token },
                }),
            );
            return {
                items: (res?.snapshots ?? []).map((m) => new Snapshot(conn, toSnapshotInfo(m))),
                next: res?.nextPageToken,
            };
        }, opts.nextToken);
    }

    /** Deletes a snapshot by id. Resolves `false` when it does not exist. */
    static async delete(snapshotId: string, opts: ClientOptions = {}): Promise<boolean> {
        return deleteSnapshot(connect(opts), snapshotId);
    }

    /** Reads the snapshot again. */
    async refresh(): Promise<SnapshotInfo> {
        this.info = await fetchSnapshot(this.conn, this.snapshotId);
        return this.info;
    }

    /** Deletes the snapshot. Resolves `false` when it is already gone. Sandboxes started from it are not affected. */
    async delete(): Promise<boolean> {
        return deleteSnapshot(this.conn, this.snapshotId);
    }

    /** Polls until the snapshot is complete. Raises if it failed (with the API's error message) or the wait runs out. */
    async waitUntilReady(opts: SnapshotWaitOptions = {}): Promise<this> {
        const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60_000);
        for (;;) {
            if (this.state === "SNAPSHOT_STATE_COMPLETE") return this;
            if (this.state === "SNAPSHOT_STATE_FAILED") {
                const why = this.info.errorMessage ? `: ${this.info.errorMessage}` : "";
                throw new SandboxError(`snapshot ${this.snapshotId} failed${why}`);
            }
            if (Date.now() >= deadline) {
                throw new SandboxTimeoutError(
                    `snapshot ${this.snapshotId} was not complete in time (last state ${this.state})`,
                );
            }
            await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 2_000));
            await this.refresh();
        }
    }
}

async function fetchSnapshot(conn: Connection, snapshotId: string): Promise<SnapshotInfo> {
    if (!snapshotId?.trim()) throw new SandboxError("`snapshotId` is required");
    const res = await call(() => conn.client.v2.sandboxes.snapshots.bySnapshot_id(snapshotId).get());
    return toSnapshotInfo(required(res, "the snapshot").snapshot);
}

async function deleteSnapshot(conn: Connection, snapshotId: string): Promise<boolean> {
    if (!snapshotId?.trim()) throw new SandboxError("`snapshotId` is required");
    try {
        await call(() => conn.client.v2.sandboxes.snapshots.bySnapshot_id(snapshotId).delete());
        return true;
    } catch (err) {
        if (err instanceof NotFoundError) return false;
        throw err;
    }
}
