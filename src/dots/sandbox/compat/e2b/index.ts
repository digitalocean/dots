/* eslint-disable @typescript-eslint/no-explicit-any -- the vendor signatures use any */
/**
 * E2B compatibility client for DigitalOcean Sandboxes. Migration only.
 *
 * Matches the public API of the `e2b` npm package, version 2.64.0
 * (`Sandbox`, `Commands`, `CommandHandle`, `E2B`, errors, option types). A call keeps its E2B
 * name and signature and runs on the DigitalOcean Sandboxes API. A member that DigitalOcean
 * Sandboxes cannot serve yet (files, PTY, ports, volumes, git, metadata, lifetime, network
 * policy, create-from-snapshot) keeps its signature and throws {@link NotImplementedError}.
 *
 * Authentication: `apiKey` is a DigitalOcean API token, or set `DIGITALOCEAN_ACCESS_TOKEN`.
 * No request ever goes to E2B: `domain`, `apiUrl`, `sandboxUrl`, `headers`, `proxy`,
 * `httpVersion`, `retries`, `debug`, `logger`, `validateApiKey` and `requestTimeoutMs` are ignored.
 *
 * `generated.ts` is produced by `scripts/gen-sandbox-compat.mjs`. This file overrides what works.
 */

import type { ClientOptions } from "../../config.js";
import * as Do from "../../errors.js";
import { Sandbox as DoSandbox, type SandboxListOptions } from "../../sandbox.js";
import type { Command as DoCommand } from "../../commands.js";
import { Snapshot as DoSnapshot } from "../../snapshots.js";
import { Template as DoTemplate } from "../../templates.js";
import { NotImplementedError } from "../errors.js";
import { rejectExplicit, secondsFromMs, shortState, sizeSpec } from "../common.js";
import * as G from "./generated.js";

export * from "./generated.js";

const PLATFORM = "E2B";

/** E2B options that DigitalOcean Sandboxes cannot honor yet. Passing one explicitly throws. */
const CREATE_UNSUPPORTED = {
    idempotencyKey: "an idempotency key API",
    metadata: "a sandbox metadata API",
    timeoutMs: "a sandbox lifetime API",
    cpuCount: "custom CPU and memory sizes (use a size slug through the DigitalOcean SDK)",
    secure: "a sandbox access token API",
    mcp: "an MCP gateway API",
    network: "a network policy API",
    iam: "a sandbox IAM API",
    volumeMounts: "a volumes API",
    lifecycle: "a sandbox lifetime API",
} as const;

function clientOpts(token: string | undefined, bound: ClientOptions | undefined, opts: { apiKey?: string } | undefined): ClientOptions {
    return { ...bound, token: opts?.apiKey ?? bound?.token ?? token };
}

/** Maps a DigitalOcean sandbox error to the E2B error class a migrated `catch` expects. */
export function toE2bError(err: unknown): unknown {
    if (err instanceof NotImplementedError) return err;
    if (!(err instanceof Do.SandboxError)) return err;
    let out: G.SandboxError;
    if (err instanceof Do.NotFoundError) out = new G.SandboxNotFoundError(err.message);
    else if (err instanceof Do.AuthenticationError || err instanceof Do.PermissionDeniedError) out = new G.AuthenticationError(err.message);
    else if (err instanceof Do.RateLimitError) out = new G.RateLimitError(err.message);
    else if (err instanceof Do.InvalidRequestError || err instanceof Do.ConflictError) out = new G.InvalidArgumentError(err.message);
    else if (err instanceof Do.SandboxTimeoutError) out = new G.TimeoutError(err.message);
    else out = new G.SandboxError(err.message);
    out.statusCode = err.status || undefined;
    return out;
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        throw toE2bError(err);
    }
}

function toInfo(info: DoSandbox["info"]): G.SandboxInfo {
    const { vcpus, memoryMB } = sizeSpec(info.sizeSlug);
    const state = shortState(info.state);
    return {
        sandboxId: info.sandboxId,
        templateId: info.template,
        name: undefined,
        metadata: {},
        startedAt: info.createdAt ?? new Date(0),
        // DigitalOcean sandboxes have no lifetime limit, so there is no end time.
        endAt: new Date(8.64e15),
        state: state === "paused" ? "paused" : "running",
        cpuCount: vcpus,
        memoryMB,
        envdVersion: "",
    };
}

/** `CommandExitError` with working accessors. */
export class CommandExitError<Output extends string | undefined = string> extends G.CommandExitError<Output> {
    private readonly result: G.CommandResult<Output>;
    constructor(result: G.CommandResult<Output>) {
        super(result);
        this.result = result;
        this.message = `Command exited with code ${result.exitCode}${result.error ? ` and error:\n${result.error}` : ""}`;
        this.name = "CommandExitError";
    }
    get exitCode(): number {
        return this.result.exitCode;
    }
    get error(): string | undefined {
        return this.result.error;
    }
    get stdout(): Output {
        return this.result.stdout;
    }
    get stderr(): Output {
        return this.result.stderr;
    }
}

type OutputCb = ((data: string) => void | Promise<void>) | undefined;

/** A running or finished command. */
export class CommandHandle<Output extends string | undefined = string> extends G.CommandHandle<Output> {
    private out = "";
    private err = "";
    private code: number | undefined;
    private errMessage: string | undefined;
    private readonly retain: boolean;
    private readonly done: Promise<void>;
    private failure: unknown;

    constructor(
        private readonly cmd: DoCommand,
        callbacks: { onStdout?: OutputCb; onStderr?: OutputCb; retainOutput?: boolean; signal?: AbortSignal } = {},
    ) {
        super(cmd.pid);
        (this as { pid: number }).pid = cmd.pid;
        this.retain = callbacks.retainOutput !== false;
        this.done = this.pump(callbacks);
        this.done.catch(() => undefined);
    }

    private async pump(cb: { onStdout?: OutputCb; onStderr?: OutputCb; signal?: AbortSignal }): Promise<void> {
        try {
            const out = new TextDecoder();
            const err = new TextDecoder();
            for await (const ev of this.cmd.stream({ signal: cb.signal })) {
                if (ev.type === "stdout") {
                    const text = out.decode(ev.data, { stream: true });
                    if (this.retain) this.out += text;
                    if (text) await cb.onStdout?.(text);
                } else if (ev.type === "stderr") {
                    const text = err.decode(ev.data, { stream: true });
                    if (this.retain) this.err += text;
                    if (text) await cb.onStderr?.(text);
                } else if (ev.type === "exit") {
                    this.code = ev.exitCode;
                    this.errMessage = ev.error;
                }
            }
        } catch (e) {
            this.failure = toE2bError(e);
        }
    }

    get exitCode(): number | undefined {
        return this.code;
    }
    get error(): string | undefined {
        return this.errMessage;
    }
    get stdout(): Output {
        return this.out as Output;
    }
    get stderr(): Output {
        return this.err as Output;
    }

    async wait(): Promise<G.CommandResult<Output>> {
        await this.done;
        if (this.failure) throw this.failure;
        if (this.code === undefined) throw new G.SandboxError("the command stream ended before the command exited");
        const result = { exitCode: this.code, error: this.errMessage, stdout: this.stdout, stderr: this.stderr };
        if (this.code !== 0) throw new CommandExitError(result);
        return result;
    }

    async disconnect(): Promise<void> {
        // The stream is read in the background; there is nothing to release client side.
    }

    async kill(): Promise<boolean> {
        return wrap(async () => {
            try {
                await this.cmd.kill("SIGKILL");
                return true;
            } catch (e) {
                if (e instanceof Do.NotFoundError) return false;
                throw e;
            }
        });
    }

    async sendStdin(data: string | Uint8Array): Promise<void> {
        await wrap(() => this.cmd.writeStdin(data));
    }

    async closeStdin(): Promise<void> {
        await wrap(() => this.cmd.closeStdin());
    }
}

/** `sandbox.commands`. */
export class Commands extends G.Commands {
    constructor(private readonly ds: DoSandbox) {
        super();
    }

    get supportsStdinClose(): boolean {
        return true;
    }

    async list(opts?: G.CommandRequestOpts): Promise<G.ProcessInfo[]> {
        void opts;
        return wrap(async () =>
            (await this.ds.commands.list()).map((c) => ({ pid: c.pid, cmd: c.cmd, args: [], envs: {}, cwd: c.cwd })),
        );
    }

    async sendStdin(pid: number, data: string | Uint8Array, opts?: G.CommandRequestOpts): Promise<void> {
        void opts;
        await wrap(() => this.ds.commands.connect(pid).writeStdin(data));
    }

    async closeStdin(pid: number, opts?: G.CommandRequestOpts): Promise<void> {
        void opts;
        await wrap(() => this.ds.commands.connect(pid).closeStdin());
    }

    async kill(pid: number, opts?: G.CommandRequestOpts): Promise<boolean> {
        void opts;
        return new CommandHandle(this.ds.commands.connect(pid)).kill();
    }

    async connect<RetainOutput extends boolean | undefined = undefined>(
        pid: number,
        opts?: G.CommandConnectOpts & { retainOutput?: RetainOutput },
    ): Promise<G.CommandHandle<G.CommandOutput<RetainOutput>>> {
        return new CommandHandle(this.ds.commands.connect(pid), {
            onStdout: opts?.onStdout,
            onStderr: opts?.onStderr,
            retainOutput: opts?.retainOutput,
        }) as unknown as G.CommandHandle<G.CommandOutput<RetainOutput>>;
    }

    run<RetainOutput extends boolean | undefined = undefined>(
        cmd: string,
        opts?: G.CommandStartOpts & { background?: false; retainOutput?: RetainOutput },
    ): Promise<G.CommandResult<G.CommandOutput<RetainOutput>>>;
    run<RetainOutput extends boolean | undefined = undefined>(
        cmd: string,
        opts: G.CommandStartOpts & { background: true; retainOutput?: RetainOutput },
    ): Promise<G.CommandHandle<G.CommandOutput<RetainOutput>>>;
    run<RetainOutput extends boolean | undefined = undefined>(
        cmd: string,
        opts?: G.CommandStartOpts & { background?: boolean; retainOutput?: RetainOutput },
    ): Promise<G.CommandHandle<G.CommandOutput<RetainOutput>> | G.CommandResult<G.CommandOutput<RetainOutput>>>;
    async run(cmd: string, opts: G.CommandStartOpts = {}): Promise<any> {
        rejectExplicit(PLATFORM, "Commands.run", opts, { user: "a command user API" });
        const shell = opts.shell && opts.shell.length > 0 ? opts.shell : ["/bin/bash", "-l", "-c"];
        const started = await wrap(() =>
            this.ds.commands.start(shell[0], {
                args: [...shell.slice(1), cmd],
                cwd: opts.cwd,
                envVars: opts.envs,
                stdin: opts.stdin,
                timeoutSeconds: opts.timeoutMs ? secondsFromMs(opts.timeoutMs) : undefined,
            }),
        );
        const handle = new CommandHandle(started, {
            onStdout: opts.onStdout,
            onStderr: opts.onStderr,
            retainOutput: opts.retainOutput,
            signal: opts.signal,
        });
        return opts.background ? handle : handle.wait();
    }
}

type Statics = { token?: string; bound?: ClientOptions };

/** E2B's `Sandbox`, on DigitalOcean Sandboxes. */
export class Sandbox extends G.Sandbox {
    protected static compat: Statics = {};
    declare readonly sandboxId: string;
    private doSandbox!: DoSandbox;

    private base: ClientOptions;

    constructor(ds: DoSandbox, base: ClientOptions = {}) {
        super({ sandboxId: ds.sandboxId, envdVersion: "" } as never);
        this.doSandbox = ds;
        this.base = base;
        const self = this as unknown as Record<string, unknown>;
        self.sandboxId = ds.sandboxId;
        self.sandboxDomain = "";
        self.commands = new Commands(ds);
        self.files = Object.create(G.Filesystem.prototype);
        self.pty = Object.create(G.Commands.prototype);
        self.git = Object.create(G.Git.prototype);
    }

    private static wrapSandbox<S extends typeof Sandbox>(cls: S, ds: DoSandbox, base: ClientOptions): InstanceType<S> {
        return new (cls as unknown as new (d: DoSandbox, b: ClientOptions) => InstanceType<S>)(ds, base);
    }

    private static options(opts: { apiKey?: string } | undefined): ClientOptions {
        return clientOpts(undefined, (this as typeof Sandbox).compat.bound, opts);
    }

    static override list(opts?: G.SandboxListOpts): G.SandboxPaginator {
        rejectExplicit(PLATFORM, "Sandbox.list", opts, { order: "a sandbox ordering API" });
        rejectExplicit(PLATFORM, "Sandbox.list query", opts?.query, { metadata: "a sandbox metadata API" });
        return new SandboxPaginator(opts, Sandbox.options.call(this, opts));
    }

    static override create<S extends typeof G.Sandbox>(this: S, opts?: G.SandboxOpts): Promise<InstanceType<S>>;
    static override create<S extends typeof G.Sandbox>(this: S, template: string, opts?: G.SandboxOpts): Promise<InstanceType<S>>;
    static override async create(...args: any[]): Promise<any> {
        const cls = this as unknown as typeof Sandbox;
        const template: string | undefined = typeof args[0] === "string" ? args[0] : undefined;
        const opts: G.SandboxOpts = (typeof args[0] === "string" ? args[1] : args[0]) ?? {};
        rejectExplicit(PLATFORM, "Sandbox.create", opts, CREATE_UNSUPPORTED);
        const ds = await wrap(() =>
            DoSandbox.create({
                ...Sandbox.options.call(cls, opts),
                template: template ?? opts.template,
                envVars: opts.envs,
                allowInternetAccess: opts.allowInternetAccess,
            }),
        );
        return Sandbox.wrapSandbox(cls, ds, Sandbox.options.call(cls, opts));
    }

    static override async connect<S extends typeof G.Sandbox>(this: S, sandboxId: string, opts?: G.SandboxConnectOpts): Promise<InstanceType<S>> {
        const cls = this as unknown as typeof Sandbox;
        rejectExplicit(PLATFORM, "Sandbox.connect", opts, { timeoutMs: "a sandbox lifetime API", onResume: "a resume mode API" });
        const ds = await wrap(() => DoSandbox.connect(sandboxId, Sandbox.options.call(cls, opts)));
        return Sandbox.wrapSandbox(cls, ds, Sandbox.options.call(cls, opts)) as InstanceType<S>;
    }

    async connect(opts?: G.SandboxConnectOpts): Promise<this> {
        rejectExplicit(PLATFORM, "Sandbox.connect", opts, { timeoutMs: "a sandbox lifetime API", onResume: "a resume mode API" });
        await wrap(() => this.doSandbox.getInfo());
        if (this.doSandbox.state === "SANDBOX_STATE_PAUSED") await wrap(() => this.doSandbox.resume());
        return this;
    }

    async isRunning(opts?: Pick<G.ConnectionOpts, "requestTimeoutMs" | "signal">): Promise<boolean> {
        void opts;
        return wrap(() => this.doSandbox.isRunning());
    }

    async kill(opts?: Pick<G.SandboxOpts, "requestTimeoutMs" | "signal">): Promise<boolean> {
        void opts;
        return wrap(() => this.doSandbox.kill());
    }

    async pause(opts?: G.SandboxPauseOpts): Promise<boolean> {
        void opts;
        await wrap(() => this.doSandbox.pause());
        return true;
    }

    async betaPause(opts?: G.SandboxPauseOpts): Promise<boolean> {
        return this.pause(opts);
    }

    async getInfo(opts?: Pick<G.SandboxOpts, "requestTimeoutMs" | "signal">): Promise<G.SandboxInfo> {
        void opts;
        return toInfo(await wrap(() => this.doSandbox.getInfo()));
    }

    async createSnapshot(opts?: G.CreateSnapshotOpts): Promise<G.SnapshotInfo> {
        rejectExplicit(PLATFORM, "Sandbox.createSnapshot", opts, { mode: "a snapshot mode API" });
        return snapshotInfo(await wrap(async () => (await this.doSandbox.createSnapshot({ name: opts?.name })).waitUntilReady()));
    }

    listSnapshots(opts?: Omit<G.SnapshotListOpts, "sandboxId">): G.SnapshotPaginator {
        return new SnapshotPaginator({ ...opts, sandboxId: this.sandboxId }, clientOpts(undefined, this.base, opts));
    }

    // Static counterparts of the instance methods.

    static override async kill(sandboxId: string, opts?: G.SandboxApiOpts): Promise<boolean> {
        return wrap(() => DoSandbox.kill(sandboxId, Sandbox.options.call(this, opts)));
    }

    static override async pause(sandboxId: string, opts?: G.SandboxPauseOpts): Promise<boolean> {
        await wrap(() => DoSandbox.pause(sandboxId, Sandbox.options.call(this, opts)));
        return true;
    }

    static override async betaPause(sandboxId: string, opts?: G.SandboxPauseOpts): Promise<boolean> {
        return (this as typeof Sandbox).pause(sandboxId, opts);
    }

    static override async getInfo(sandboxId: string, opts?: G.SandboxApiOpts): Promise<G.SandboxInfo> {
        return toInfo((await wrap(() => DoSandbox.get(sandboxId, Sandbox.options.call(this, opts)))).info);
    }

    static override async createSnapshot(sandboxId: string, opts?: G.CreateSnapshotOpts): Promise<G.SnapshotInfo> {
        rejectExplicit(PLATFORM, "Sandbox.createSnapshot", opts, { mode: "a snapshot mode API" });
        return snapshotInfo(
            await wrap(async () =>
                (await DoSnapshot.create(sandboxId, { ...Sandbox.options.call(this, opts), name: opts?.name })).waitUntilReady(),
            ),
        );
    }

    static override listSnapshots(opts?: G.SnapshotListOpts): G.SnapshotPaginator {
        return new SnapshotPaginator(opts, Sandbox.options.call(this, opts));
    }

    static override async deleteSnapshot(snapshotId: string, opts?: G.SandboxApiOpts): Promise<boolean> {
        return wrap(() => DoSnapshot.delete(snapshotId, Sandbox.options.call(this, opts)));
    }
}

function snapshotInfo(s: DoSnapshot): G.SnapshotInfo {
    return { snapshotId: s.snapshotId, names: s.name ? [s.name] : [] };
}

/** Pages of sandboxes, newest API order. */
export class SandboxPaginator extends G.SandboxPaginator {
    private readonly pages: ReturnType<typeof DoSandbox.list>;
    private readonly filter: (info: G.SandboxInfo) => boolean;

    constructor(opts: G.SandboxListOpts | undefined, base: ClientOptions) {
        super(opts);
        const states = opts?.query?.state ?? ["running", "paused"];
        const template = opts?.query?.template;
        const after = opts?.query?.startedAfter;
        this.filter = (i) =>
            states.includes(i.state) && (!template || i.templateId === template) && (!after || i.startedAt >= after);
        const listOpts: SandboxListOptions = { ...base, limit: opts?.limit, nextToken: opts?.nextToken };
        if (states.length === 1) listOpts.state = states[0] === "paused" ? "SANDBOX_STATE_PAUSED" : "SANDBOX_STATE_RUNNING";
        this.pages = DoSandbox.list(listOpts);
    }

    get hasNext(): boolean {
        return this.pages.hasNext;
    }

    get nextToken(): string | undefined {
        return this.pages.nextToken;
    }

    async nextItems(opts?: G.SandboxApiOpts): Promise<G.SandboxInfo[]> {
        void opts;
        const items = await wrap(() => this.pages.nextItems());
        return items.filter((s) => shortState(s.info.state) !== "creating").map((s) => toInfo(s.info)).filter(this.filter);
    }
}

/** Pages of snapshots. */
export class SnapshotPaginator extends G.SnapshotPaginator {
    private readonly pages: ReturnType<typeof DoSnapshot.list>;
    private readonly name?: string;

    constructor(opts: G.SnapshotListOpts | undefined, base: ClientOptions) {
        super(opts);
        this.name = opts?.name;
        this.pages = DoSnapshot.list({ ...base, sandboxId: opts?.sandboxId, limit: opts?.limit, nextToken: opts?.nextToken });
    }

    get hasNext(): boolean {
        return this.pages.hasNext;
    }

    get nextToken(): string | undefined {
        return this.pages.nextToken;
    }

    async nextItems(opts?: G.SandboxApiOpts): Promise<G.SnapshotInfo[]> {
        void opts;
        const items = await wrap(() => this.pages.nextItems());
        return items.map(snapshotInfo).filter((s) => !this.name || s.names.includes(this.name));
    }
}

/**
 * E2B's template builder. `Template().fromImage(ref)` followed by `Template.build(...)` builds a
 * DigitalOcean template from the OCI image. Builder steps (`copy`, `runCmd`, `setEnvs`, ...) throw
 * {@link NotImplementedError}: DigitalOcean templates are built from an image, with no build steps yet.
 */
export class TemplateBase extends G.TemplateBase {
    /** @internal */
    imageRef?: string;

    fromImage(baseImage: string, credentials?: { username: string; password: string }): G.TemplateBuilder {
        if (credentials) {
            throw new NotImplementedError(`${PLATFORM}: TemplateBase.fromImage with credentials is not implemented on DigitalOcean Sandboxes yet: needs private registry credentials for template builds`, "TemplateBase.fromImage", PLATFORM);
        }
        this.imageRef = baseImage;
        return this as unknown as G.TemplateBuilder;
    }

    static override build(template: G.TemplateClass, name: string, options?: Omit<G.BuildOptions, "alias">): Promise<G.BuildInfo>;
    static override build(template: G.TemplateClass, options: G.BuildOptions): Promise<G.BuildInfo>;
    static override async build(template: G.TemplateClass, nameOrOptions: string | G.BuildOptions, options?: Omit<G.BuildOptions, "alias">): Promise<G.BuildInfo> {
        const { name, opts } = buildArgs(nameOrOptions, options);
        const created = await createTemplate(template, name, opts);
        await wrap(() => created.waitUntilReady());
        return buildInfo(created);
    }

    static override buildInBackground(template: G.TemplateClass, name: string, options?: Omit<G.BuildOptions, "alias">): Promise<G.BuildInfo>;
    static override buildInBackground(template: G.TemplateClass, options: G.BuildOptions): Promise<G.BuildInfo>;
    static override async buildInBackground(template: G.TemplateClass, nameOrOptions: string | G.BuildOptions, options?: Omit<G.BuildOptions, "alias">): Promise<G.BuildInfo> {
        const { name, opts } = buildArgs(nameOrOptions, options);
        return buildInfo(await createTemplate(template, name, opts));
    }

    static override async exists(name: string, options?: G.ConnectionOpts): Promise<boolean> {
        return (await findTemplate(name, options)) !== undefined;
    }

    static override async aliasExists(alias: string, options?: G.ConnectionOpts): Promise<boolean> {
        return TemplateBase.exists(alias, options);
    }

    static override async delete(nameOrId: string, options?: G.ConnectionOpts): Promise<boolean> {
        const t = await findTemplate(nameOrId, options);
        return t ? wrap(() => t.delete()) : false;
    }
}

function buildArgs(nameOrOptions: string | G.BuildOptions, options?: Omit<G.BuildOptions, "alias">): { name: string; opts: Omit<G.BuildOptions, "alias"> } {
    const opts = (typeof nameOrOptions === "string" ? options : nameOrOptions) ?? {};
    const name = typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.alias;
    rejectExplicit(PLATFORM, "Template.build", opts, {
        tags: "template tags",
        cpuCount: "template CPU sizing",
        maxCpuCount: "template CPU sizing",
        memoryMB: "template memory sizing",
        minFreeDiskMb: "template disk sizing",
        skipCache: "a build cache API",
        onBuildLogs: "a build logs API",
    });
    return { name, opts };
}

async function createTemplate(template: G.TemplateClass, name: string, opts: G.ConnectionOpts): Promise<DoTemplate> {
    const ref = (template as unknown as TemplateBase).imageRef;
    if (!ref) {
        throw new NotImplementedError(`${PLATFORM}: Template.build without fromImage is not implemented on DigitalOcean Sandboxes yet: needs a build API for base images and Dockerfiles (use Template().fromImage(<oci-ref>))`, "Template.build", PLATFORM);
    }
    return wrap(() => DoTemplate.create({ ...clientOpts(undefined, undefined, opts), name, sourceOciRef: ref }));
}

async function findTemplate(nameOrId: string, opts?: G.ConnectionOpts): Promise<DoTemplate | undefined> {
    return wrap(async () => {
        for await (const t of DoTemplate.list(clientOpts(undefined, undefined, opts))) {
            if (t.name === nameOrId || t.templateId === nameOrId) return t;
        }
        return undefined;
    });
}

async function buildInfo(t: DoTemplate): Promise<G.BuildInfo> {
    const builds = await wrap(() => t.builds({ limit: 1 }).nextItems());
    return { alias: t.name, name: t.name, tags: [], templateId: t.templateId, buildId: builds[0]?.buildId ?? "" };
}

/** `Template()` starts a builder. `Template.build(...)`, `Template.exists(...)` and the other statics work on the class. */
export const Template: G.CallableTemplate<typeof TemplateBase> = new Proxy(
    function Template(options?: G.TemplateOptions) {
        return new TemplateBase(options);
    } as unknown as G.CallableTemplate<typeof TemplateBase>,
    {
        get: (target, prop) => (prop in target ? (target as never)[prop] : (TemplateBase as never)[prop]),
    },
);

/**
 * The E2B client object: `new E2B({ apiKey })` returns `Sandbox`, `Volume`, `Template`, and `Secret`
 * bound to that key. Also exported as `E2bClient`.
 */
export class E2bClient extends G.E2B {
    constructor(opts?: G.E2BClientOpts & { apiUrl?: never }) {
        super(opts);
        const token = opts?.apiKey;
        class BoundSandbox extends Sandbox {
            protected static override compat: Statics = { token, bound: { token } };
        }
        (this as unknown as Record<string, unknown>).Sandbox = BoundSandbox;
        (this as unknown as Record<string, unknown>).Volume = G.Volume;
        (this as unknown as Record<string, unknown>).Template = Template;
        (this as unknown as Record<string, unknown>).Secret = G.Secret;
    }
}

export { E2bClient as E2B };
export default Sandbox;

/** The members this overlay serves. Everything else in `generated.ts` throws {@link NotImplementedError}. */
export const IMPLEMENTED: ReadonlySet<string> = new Set([
    "Sandbox.list", "Sandbox.create", "Sandbox.connect", "Sandbox.isRunning", "Sandbox.kill", "Sandbox.pause", "Sandbox.betaPause",
    "Sandbox.getInfo", "Sandbox.createSnapshot", "Sandbox.listSnapshots", "Sandbox.deleteSnapshot",
    "Commands.supportsStdinClose", "Commands.list", "Commands.sendStdin", "Commands.closeStdin", "Commands.kill",
    "Commands.connect", "Commands.run",
    "CommandHandle.exitCode", "CommandHandle.error", "CommandHandle.stderr", "CommandHandle.stdout", "CommandHandle.wait",
    "CommandHandle.disconnect", "CommandHandle.kill", "CommandHandle.sendStdin", "CommandHandle.closeStdin",
    "CommandExitError.exitCode", "CommandExitError.error", "CommandExitError.stdout", "CommandExitError.stderr",
    "SandboxPaginator.nextItems", "SnapshotPaginator.nextItems",
    "TemplateBase.fromImage", "TemplateBase.build", "TemplateBase.buildInBackground", "TemplateBase.exists", "TemplateBase.aliasExists",
    "TemplateBase.delete",
]);

/** The classes the compat tests walk, by name. */
export const CLASSES: Readonly<Record<string, unknown>> = {
    ...G,
    Sandbox, Commands, CommandHandle, CommandExitError, SandboxPaginator, SnapshotPaginator, TemplateBase,
};
