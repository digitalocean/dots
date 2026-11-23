/* eslint-disable @typescript-eslint/no-explicit-any -- the vendor signatures use any */
/**
 * Daytona compatibility client for DigitalOcean Sandboxes. Migration only.
 *
 * Matches the 0.x-style client of the `@daytona/sdk` npm package, version 2.1.0, which SDK 2.x
 * keeps under `daytona.v0` (`Daytona`, `Sandbox`, `Process`, `SnapshotService`, errors, option
 * types). Here `Daytona` is the client itself, so `daytona.create(...)`, `daytona.get(...)` and
 * `sandbox.process.executeCommand(...)` keep working. A member that DigitalOcean Sandboxes cannot
 * serve yet (file system, git, LSP, computer use, code interpreter, PTY, sessions, preview links,
 * labels, lifetime intervals, volumes, regions, create-from-image) keeps its signature and throws
 * {@link NotImplementedError}.
 *
 * Authentication: `apiKey` is a DigitalOcean API token, or set `DIGITALOCEAN_ACCESS_TOKEN`.
 * No request ever goes to Daytona: `apiUrl`, `serverUrl`, `organizationId`, `otelEnabled`,
 * `useDeprecatedPolling`, `requestTimeoutMs` and `_experimental` are ignored.
 *
 * `generated.ts` is produced by `scripts/gen-sandbox-compat.mjs`. This file overrides what works.
 */

import type { ClientOptions } from "../../config.js";
import * as Do from "../../errors.js";
import { Sandbox as DoSandbox } from "../../sandbox.js";
import { Template as DoTemplate, type TemplateInfo } from "../../templates.js";
import { NotImplementedError } from "../errors.js";
import { rejectExplicit, shortState, sizeSpec } from "../common.js";
import * as G from "./generated.js";

export * from "./generated.js";

const PLATFORM = "Daytona";

type DoInfo = DoSandbox["info"];

/** Maps a DigitalOcean sandbox error to the Daytona error class a migrated `catch` expects. */
export function toDaytonaError(err: unknown): unknown {
    if (err instanceof NotImplementedError) return err;
    if (!(err instanceof Do.SandboxError)) return err;
    let out: G.DaytonaError;
    if (err instanceof Do.NotFoundError) out = new G.DaytonaNotFoundError(err.message);
    else if (err instanceof Do.AuthenticationError) out = new G.DaytonaAuthenticationError(err.message);
    else if (err instanceof Do.PermissionDeniedError) out = new G.DaytonaForbiddenError(err.message);
    else if (err instanceof Do.InvalidRequestError) out = new G.DaytonaBadRequestError(err.message);
    else if (err instanceof Do.ConflictError) out = new G.DaytonaConflictError(err.message);
    else if (err instanceof Do.RateLimitError) out = new G.DaytonaRateLimitError(err.message);
    else if (err instanceof Do.SandboxTimeoutError) out = new G.DaytonaTimeoutError(err.message);
    else if (err instanceof Do.ServiceError) out = new G.DaytonaInternalServerError(err.message);
    else out = new G.DaytonaError(err.message);
    out.statusCode = err.status || undefined;
    return out;
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        throw toDaytonaError(err);
    }
}

/** Daytona sandbox states: `started`, `stopped`, `creating`. */
function daytonaState(state: string): string {
    switch (shortState(state)) {
        case "running":
            return "started";
        case "paused":
            return "stopped";
        case "creating":
            return "creating";
        default:
            return "unknown";
    }
}

/** `sandbox.process`. */
export class Process extends G.Process {
    constructor(private readonly ds: DoSandbox) {
        super();
    }

    /**
     * Runs `command` through `bash -lc`. `result` holds stdout followed by stderr: Daytona returns one combined string.
     * `timeout` is in seconds.
     */
    async executeCommand(command: string, cwd?: string, env?: Record<string, string>, timeout?: number): Promise<G.ExecuteResponse> {
        const r = await wrap(() =>
            this.ds.commands.run(command, { cwd, envVars: env, timeoutSeconds: timeout && timeout > 0 ? Math.ceil(timeout) : undefined }),
        );
        return { exitCode: r.exitCode, result: r.stdout + r.stderr };
    }
}

/** Daytona's `Sandbox`, on a DigitalOcean sandbox. */
export class Sandbox extends G.Sandbox {
    private doSandbox: DoSandbox;

    constructor(ds: DoSandbox) {
        super();
        this.doSandbox = ds;
        this.applyInfo(ds.info);
        const self = this as unknown as Record<string, unknown>;
        self.process = new Process(ds);
        self.fs = Object.create(G.FileSystem.prototype);
        self.git = Object.create(G.Git.prototype);
        self.computerUse = Object.create(G.ComputerUse.prototype);
        self.codeInterpreter = Object.create(G.CodeInterpreter.prototype);
        self.nodes = Object.create(G.Sandbox.prototype);
        this.nodeCount = 1;
        this.toolboxProxyUrl = "";
    }

    private applyInfo(info: DoInfo): void {
        const { vcpus, memoryMB } = sizeSpec(info.sizeSlug);
        this.id = info.sandboxId;
        this.name = info.sandboxId;
        this.organizationId = "";
        this.snapshot = info.template;
        this.user = "";
        this.labels = {};
        this.public = false;
        this.target = "";
        this.cpu = vcpus;
        this.gpu = 0;
        this.memory = memoryMB / 1024;
        this.disk = 0;
        this.state = daytonaState(info.state) as never;
        this.desiredState = daytonaState(info.state) as never;
        this.createdAt = info.createdAt?.toISOString();
    }

    async refreshData(): Promise<void> {
        this.applyInfo(await wrap(() => this.doSandbox.getInfo()));
    }

    /** Resumes the sandbox. `timeout` is ignored: the call returns when the sandbox is running. */
    async start(timeout?: number): Promise<void> {
        void timeout;
        this.applyInfo(await wrap(() => this.doSandbox.resume()));
    }

    /** Pauses the sandbox. `timeout` and `force` are ignored. */
    async stop(timeout?: number, force?: boolean): Promise<void> {
        void timeout;
        void force;
        this.applyInfo(await wrap(() => this.doSandbox.pause()));
    }

    async pause(timeout?: number): Promise<void> {
        return this.stop(timeout);
    }

    async delete(timeout?: number, wait?: boolean): Promise<void> {
        void timeout;
        void wait;
        await wrap(() => this.doSandbox.kill());
    }

    async waitUntilStarted(timeout?: number): Promise<void> {
        await wrap(() => this.doSandbox.waitUntilRunning({ timeoutMs: timeout && timeout > 0 ? timeout * 1000 : undefined }));
        this.applyInfo(this.doSandbox.info);
    }

    async waitUntilStopped(timeout?: number): Promise<void> {
        const deadline = Date.now() + (timeout && timeout > 0 ? timeout * 1000 : 60_000);
        for (;;) {
            await this.refreshData();
            if (this.doSandbox.state === "SANDBOX_STATE_PAUSED") return;
            if (Date.now() >= deadline) throw new G.DaytonaTimeoutError(`sandbox ${this.id} did not stop in time`);
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    /**
     * Captures the sandbox as a DigitalOcean snapshot named `name` and waits for it. Unlike a Daytona snapshot,
     * it cannot start a new sandbox yet (no restore API).
     */
    async createSnapshot(name: string, timeout?: number): Promise<void> {
        const s = await wrap(() => this.doSandbox.createSnapshot({ name }));
        await wrap(() => s.waitUntilReady({ timeoutMs: timeout && timeout > 0 ? timeout * 1000 : undefined }));
    }
}

/** Daytona's `Snapshot` DTO for a DigitalOcean template: a reusable base for new sandboxes. */
function toSnapshotDto(t: TemplateInfo): G.Snapshot {
    const ref = t.image ? `${t.image.registry ?? ""}/${t.image.repository ?? ""}${t.image.tag ? `:${t.image.tag}` : ""}`.replace(/^\//, "") : "";
    const status = t.status === "TEMPLATE_STATUS_READY" ? "active" : t.status === "TEMPLATE_STATUS_FAILED" ? "error" : "building";
    return {
        id: t.templateId,
        general: false,
        name: t.name,
        imageName: ref,
        state: status,
        size: null,
        entrypoint: null,
        cpu: 0,
        gpu: 0,
        mem: 0,
        disk: 0,
        errorReason: null,
        createdAt: t.createdAt?.toISOString() ?? "",
        updatedAt: t.updatedAt?.toISOString() ?? "",
        lastUsedAt: null,
    } as unknown as G.Snapshot;
}

/** `daytona.snapshot`. A Daytona snapshot is a DigitalOcean template here. */
export class SnapshotService extends G.SnapshotService {
    constructor(private readonly base: ClientOptions) {
        super();
    }

    list(query?: G.ListSnapshotsQuery): Promise<G.PaginatedSnapshots>;
    list(page?: number, limit?: number): Promise<G.PaginatedSnapshots>;
    async list(...args: any[]): Promise<any> {
        const q: G.ListSnapshotsQuery = typeof args[0] === "object" && args[0] !== null ? args[0] : { page: args[0], limit: args[1] };
        rejectExplicit(PLATFORM, "SnapshotService.list", q, { sourceSandboxId: "a sandbox-to-snapshot lookup API" });
        const page = q.page && q.page > 0 ? q.page : 1;
        const limit = q.limit && q.limit > 0 ? q.limit : 100;
        const all: G.Snapshot[] = [];
        await wrap(async () => {
            for await (const t of DoTemplate.list({ ...this.base })) all.push(toSnapshotDto(t.info));
        });
        const items = all.slice((page - 1) * limit, page * limit);
        return { items, total: all.length, page, totalPages: Math.max(1, Math.ceil(all.length / limit)) };
    }

    async get(idOrName: string): Promise<G.Snapshot> {
        return wrap(async () => {
            try {
                return toSnapshotDto((await DoTemplate.get(idOrName, this.base)).info);
            } catch (e) {
                if (!(e instanceof Do.NotFoundError)) throw e;
            }
            for await (const t of DoTemplate.list({ ...this.base })) if (t.name === idOrName) return toSnapshotDto(t.info);
            throw new Do.NotFoundError(`snapshot ${idOrName} not found`, 404);
        });
    }

    async delete(snapshot: G.Snapshot | string): Promise<void> {
        const id = typeof snapshot === "string" ? ((await this.get(snapshot)) as unknown as { id: string }).id : (snapshot as unknown as { id: string }).id;
        await wrap(() => DoTemplate.delete(id, this.base));
    }

    /** Builds a template from an OCI image reference and waits for the build. Image builders (`Image`) need a build API. */
    async create(params: G.CreateSnapshotParams, options?: { onLogs?: (chunk: string) => void; timeout?: number }): Promise<G.Snapshot> {
        rejectExplicit(PLATFORM, "SnapshotService.create", params, {
            resources: "custom resources",
            entrypoint: "a template entrypoint API",
            regionId: "a region API",
            sandboxClass: "a sandbox class API",
        });
        if (typeof params.image !== "string") {
            throw new NotImplementedError(
                `${PLATFORM}: SnapshotService.create with an Image builder is not implemented on DigitalOcean Sandboxes yet: needs a Dockerfile build API (pass an OCI image reference string)`,
                "SnapshotService.create",
                PLATFORM,
            );
        }
        const t = await wrap(async () =>
            (await DoTemplate.create({ ...this.base, name: params.name, sourceOciRef: params.image as string })).waitUntilReady({
                timeoutMs: options?.timeout && options.timeout > 0 ? options.timeout * 1000 : undefined,
            }),
        );
        return toSnapshotDto(t.info);
    }
}

type CreateParams = G.CreateSandboxFromSnapshotParams & Partial<G.CreateSandboxFromImageParams>;

const CREATE_UNSUPPORTED = {
    name: "sandbox names",
    user: "a sandbox user API",
    labels: "a sandbox metadata API",
    public: "a ports and tunnels API",
    autoStopInterval: "a sandbox lifetime API",
    autoPauseInterval: "a sandbox lifetime API",
    autoArchiveInterval: "a sandbox lifetime API",
    autoDeleteInterval: "a sandbox lifetime API",
    ttlMinutes: "a sandbox lifetime API",
    queueTimeout: "a sandbox queue API",
    volumes: "a volumes API",
    kvm: "a nested virtualization API",
    networkAllowList: "a network policy API",
    domainAllowList: "a network policy API",
    outboundProxyUrl: "a network policy API",
    otelEndpointOverride: "a telemetry API",
    ephemeral: "an ephemeral sandbox API",
    spot: "a spot sandbox API",
    linkedSandbox: "a linked sandbox API",
    secrets: "a secrets API",
    target: "a region API",
    resources: "custom CPU, memory and disk (use a size slug through the DigitalOcean SDK)",
} as const;

/** `create` parameters in Daytona's `ListSandboxesQuery` that need an API DigitalOcean Sandboxes lacks. */
const LIST_UNSUPPORTED = {
    sort: "a sandbox sort API",
    order: "a sandbox sort API",
    name: "sandbox names",
    labels: "a sandbox metadata API",
    targets: "a region API",
    minCpu: "a sandbox resource filter API",
    maxCpu: "a sandbox resource filter API",
    minMemoryGib: "a sandbox resource filter API",
    maxMemoryGib: "a sandbox resource filter API",
    minDiskGib: "a sandbox resource filter API",
    maxDiskGib: "a sandbox resource filter API",
    isPublic: "a ports and tunnels API",
    isRecoverable: "a sandbox recovery API",
    lastActivityAfter: "an activity API",
    lastActivityBefore: "an activity API",
    autoDestroyAtAfter: "a sandbox lifetime API",
    autoDestroyAtBefore: "a sandbox lifetime API",
} as const;

/**
 * The Daytona client, on DigitalOcean Sandboxes. Also exported as `Daytona`.
 */
export class DaytonaClient extends G.Daytona {
    private readonly base: ClientOptions;

    constructor(config?: G.DaytonaConfig) {
        super(config);
        if (config?.jwtToken && !config.apiKey) {
            throw new NotImplementedError(
                `${PLATFORM}: DaytonaConfig option \`jwtToken\` is not implemented on DigitalOcean Sandboxes yet: needs JWT authentication (use \`apiKey\` with a DigitalOcean API token)`,
                "DaytonaConfig.jwtToken",
                PLATFORM,
            );
        }
        rejectExplicit(PLATFORM, "DaytonaConfig", config, { target: "a region API" });
        this.base = { token: config?.apiKey };
        const self = this as unknown as Record<string, unknown>;
        self.snapshot = new SnapshotService(this.base);
        self.volume = Object.create(G.VolumeService.prototype);
        self.secret = Object.create(G.SecretService.prototype);
        self.warmPool = Object.create(G.WarmPoolService.prototype);
    }

    async [Symbol.asyncDispose](): Promise<void> {
        // Nothing to close: each call is a plain HTTPS request.
    }

    create(params?: G.CreateSandboxFromSnapshotParams, options?: { timeout?: number }): Promise<Sandbox>;
    create(params?: G.CreateSandboxFromImageParams, options?: { onSnapshotCreateLogs?: (chunk: string) => void; timeout?: number }): Promise<Sandbox>;
    async create(params: CreateParams = {}, options?: { timeout?: number }): Promise<Sandbox> {
        rejectExplicit(PLATFORM, "Daytona.create", params, CREATE_UNSUPPORTED);
        if (params.image !== undefined) {
            throw new NotImplementedError(
                `${PLATFORM}: Daytona.create with \`image\` is not implemented on DigitalOcean Sandboxes yet: needs building a template at create time (create a template with \`daytona.snapshot.create({ name, image })\`, then pass \`snapshot\`)`,
                "Daytona.create",
                PLATFORM,
            );
        }
        void options;
        const ds = await wrap(() =>
            DoSandbox.create({
                ...this.base,
                template: params.snapshot,
                envVars: params.envVars,
                allowInternetAccess: params.networkBlockAll ? false : undefined,
            }),
        );
        return new Sandbox(ds);
    }

    /** Fetches a sandbox by ID. Sandbox names do not exist on DigitalOcean Sandboxes. */
    async get(sandboxIdOrName: string): Promise<Sandbox> {
        return new Sandbox(await wrap(() => DoSandbox.get(sandboxIdOrName, this.base)));
    }

    list(query?: G.ListSandboxesQuery): AsyncIterableIterator<Sandbox> {
        rejectExplicit(PLATFORM, "Daytona.list", query, LIST_UNSUPPORTED);
        const base = this.base;
        const states = query?.states?.map(String);
        const snapshots = query?.snapshots;
        async function* run(): AsyncGenerator<Sandbox, void, unknown> {
            let n = 0;
            for await (const ds of DoSandbox.list({ ...base })) {
                const info = ds.info;
                if (query?.id && info.sandboxId !== query.id) continue;
                if (states && !states.includes(daytonaState(info.state))) continue;
                if (snapshots && !snapshots.includes(info.template)) continue;
                if (query?.createdAtAfter && (info.createdAt ?? new Date(0)) < query.createdAtAfter) continue;
                if (query?.createdAtBefore && (info.createdAt ?? new Date(0)) > query.createdAtBefore) continue;
                yield new Sandbox(ds);
                if (query?.limit && ++n >= query.limit) return;
            }
        }
        return run();
    }

    /** Resumes the sandbox. `timeout` is ignored. */
    async start(sandbox: G.Sandbox, timeout?: number): Promise<void> {
        await (sandbox as Sandbox).start(timeout);
    }

    /** Pauses the sandbox. */
    async stop(sandbox: G.Sandbox): Promise<void> {
        await (sandbox as Sandbox).stop();
    }

    async delete(sandbox: G.Sandbox, timeout?: number, wait?: boolean): Promise<void> {
        await (sandbox as Sandbox).delete(timeout, wait);
    }
}

export { DaytonaClient as Daytona };

/** The members this overlay serves. Everything else in `generated.ts` throws {@link NotImplementedError}. */
export const IMPLEMENTED: ReadonlySet<string> = new Set([
    "Process.executeCommand",
    "Sandbox.refreshData", "Sandbox.start", "Sandbox.stop", "Sandbox.pause", "Sandbox.delete", "Sandbox.waitUntilStarted",
    "Sandbox.waitUntilStopped", "Sandbox.createSnapshot",
    "SnapshotService.list", "SnapshotService.get", "SnapshotService.delete", "SnapshotService.create",
    "Daytona.create", "Daytona.get", "Daytona.list", "Daytona.start", "Daytona.stop", "Daytona.delete", "Daytona.[Symbol.asyncDispose]",
]);

/** The classes the compat tests walk, by name. */
export const CLASSES: Readonly<Record<string, unknown>> = { ...G, Process, Sandbox, SnapshotService, Daytona: DaytonaClient };
