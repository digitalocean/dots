/* eslint-disable @typescript-eslint/no-explicit-any -- the vendor signatures use any */
/**
 * Modal compatibility client for DigitalOcean Sandboxes. Migration only.
 *
 * Matches the public API of the `modal` npm package (the JavaScript and TypeScript SDK), version
 * 0.11.2: `ModalClient` with `apps`, `images`, `sandboxes` and `secrets`, `Sandbox`,
 * `ContainerProcess`, errors and parameter types. A call keeps its Modal name and signature and
 * runs on the DigitalOcean Sandboxes API. A member that DigitalOcean Sandboxes cannot serve yet
 * (file system, volumes, tunnels, tags, names, snapshots, GPUs, network policies, functions, queues)
 * keeps its signature and throws {@link NotImplementedError}.
 *
 * Authentication: `tokenSecret` is a DigitalOcean API token, or set `DIGITALOCEAN_ACCESS_TOKEN`.
 * No request ever goes to Modal: `tokenId`, `oauth*`, `environment`, `endpoint`, `timeoutMs`,
 * `maxRetries`, `maxThrottleWaitSecs`, `logger`, `logLevel`, `grpcMiddleware` and `cpClient` are ignored.
 *
 * An `Image` from `images.fromRegistry(tag)` becomes a DigitalOcean template, built from the image on
 * first use (named `modal-<hash of tag>`, reused afterwards). A Modal app is a local label: DigitalOcean
 * Sandboxes have no apps.
 *
 * `generated.ts` is produced by `scripts/gen-sandbox-compat.mjs`. This file overrides what works.
 */

import { createHash } from "node:crypto";
import type { ClientOptions } from "../../config.js";
import * as Do from "../../errors.js";
import { Sandbox as DoSandbox } from "../../sandbox.js";
import { Template as DoTemplate } from "../../templates.js";
import type { Command as DoCommand } from "../../commands.js";
import { NotImplementedError } from "../errors.js";
import { rejectExplicit, secondsFromMs } from "../common.js";
import * as G from "./generated.js";

export * from "./generated.js";

const PLATFORM = "Modal";
const VERSION = "0.11.2";

/** `mars-*` sizes, as published by `doctl sandbox` at the time of writing. Requests round up to the smallest fit. */
const SIZES: ReadonlyArray<readonly [string, number, number]> = [
    ["mars-1vcpu-1gb", 1, 1024],
    ["mars-2vcpu-2gb", 2, 2048],
    ["mars-2vcpu-4gb", 2, 4096],
    ["mars-4vcpu-8gb", 4, 8192],
    ["mars-16vcpu-32gb", 16, 32768],
];

/** Maps a DigitalOcean sandbox error to the Modal error class a migrated `catch` expects. */
export function toModalError(err: unknown): unknown {
    if (err instanceof NotImplementedError) return err;
    if (!(err instanceof Do.SandboxError)) return err;
    if (err instanceof Do.NotFoundError) return new G.NotFoundError(err.message);
    if (err instanceof Do.ConflictError) return new G.AlreadyExistsError(err.message);
    if (err instanceof Do.InvalidRequestError) return new G.InvalidError(err.message);
    if (err instanceof Do.RateLimitError) return new G.ResourceExhaustedError(err.message);
    if (err instanceof Do.SandboxTimeoutError) return new G.SandboxTimeoutError(err.message);
    if (err instanceof Do.ServiceError) return new G.InternalFailure(err.message);
    return new G.RemoteError(err.message);
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        throw toModalError(err);
    }
}

function sizeFor(cpu: number | undefined, memoryMiB: number | undefined): string | undefined {
    if (cpu === undefined && memoryMiB === undefined) return undefined;
    const fit = SIZES.find(([, v, m]) => v >= (cpu ?? 0) && m >= (memoryMiB ?? 0));
    if (!fit) {
        throw new G.InvalidError(`Modal: no DigitalOcean sandbox size has ${cpu ?? 0} CPU and ${memoryMiB ?? 0} MiB (the largest is ${SIZES[SIZES.length - 1][0]})`);
    }
    return fit[0];
}

/** A Modal app is a label. It is never sent to DigitalOcean. */
export class App extends G.App {
    constructor(appId: string, name?: string, environmentName?: string) {
        super(appId, name, environmentName);
        const self = this as unknown as Record<string, unknown>;
        self.appId = appId;
        self.name = name;
        self.environmentName = environmentName;
    }
}

export class AppService extends G.AppService {
    /** Returns a local {@link App}. `createIfMissing` is accepted and has no effect: apps need no creation. */
    async fromName(name: string, params?: G.AppFromNameParams): Promise<App> {
        void params;
        return new App(`ap-${createHash("sha256").update(name).digest("hex").slice(0, 22)}`, name, params?.environment);
    }
}

/** A secret that holds its values locally. They reach commands as environment variables. */
export class Secret extends G.Secret {
    constructor(readonly values: Readonly<Record<string, string>>, name?: string) {
        super("", name);
        (this as unknown as Record<string, unknown>).name = name;
    }
    get secretId(): string {
        return `st-${createHash("sha256").update(JSON.stringify(this.values)).digest("hex").slice(0, 22)}`;
    }
}

export class SecretService extends G.SecretService {
    async fromObject(entries: Record<string, string>, params?: G.SecretFromObjectParams): Promise<Secret> {
        void params;
        return new Secret({ ...entries });
    }
}

/** An image reference. Building it creates a DigitalOcean template. */
export class Image extends G.Image {
    constructor(readonly tag: string) {
        super();
    }
    get imageId(): string {
        return `im-${createHash("sha256").update(this.tag).digest("hex").slice(0, 22)}`;
    }
    /** Builds the template now, or finds the one built earlier. */
    async build(app: G.App): Promise<Image> {
        void app;
        await ensureTemplate(this.baseOptions, this.tag);
        return this;
    }
    /** @internal */
    baseOptions: ClientOptions = {};
}

const templateByTag = new Map<string, Promise<string>>();

/** The template built from `tag`, created on first use. */
function ensureTemplate(base: ClientOptions, tag: string): Promise<string> {
    const name = `modal-${createHash("sha256").update(tag).digest("hex").slice(0, 16)}`;
    const key = `${base.token ?? ""}|${tag}`;
    let p = templateByTag.get(key);
    if (!p) {
        p = wrap(async () => {
            for await (const t of DoTemplate.list({ ...base })) {
                if (t.name === name) {
                    await t.waitUntilReady();
                    return name;
                }
            }
            await (await DoTemplate.create({ ...base, name, sourceOciRef: tag })).waitUntilReady();
            return name;
        });
        templateByTag.set(key, p);
        p.catch(() => templateByTag.delete(key));
    }
    return p;
}

export class ImageService extends G.ImageService {
    constructor(private readonly base: ClientOptions) {
        super();
    }
    /** `secret` (registry credentials) is not supported. */
    fromRegistry(tag: string, secret?: G.Secret): Image {
        if (secret) throw new NotImplementedError(`${PLATFORM}: ImageService.fromRegistry with a secret is not implemented on DigitalOcean Sandboxes yet: needs private registry credentials for template builds`, "ImageService.fromRegistry", PLATFORM);
        const image = new Image(tag);
        image.baseOptions = this.base;
        return image;
    }
}

// ---------------------------------------------------------------------------------------------
// Streams and processes

type Mode = "text" | "binary";

interface Feed {
    push(chunk: Uint8Array): void;
    end(): void;
    stream: G.ModalReadStream<any>;
}

function readFeed(mode: Mode): Feed {
    let controller!: ReadableStreamDefaultController<any>;
    const decoder = new TextDecoder();
    const base = new ReadableStream<any>({
        start(c) {
            controller = c;
        },
    });
    const chunks: any[] = [];
    const stream = Object.assign(base, {
        async readText(): Promise<string> {
            const parts: string[] = [];
            const reader = base.getReader();
            for (;;) {
                const r = await reader.read();
                if (r.done) break;
                parts.push(typeof r.value === "string" ? r.value : decoder.decode(r.value, { stream: true }));
            }
            return parts.join("") + decoder.decode();
        },
        async readBytes(): Promise<Uint8Array> {
            const parts: Uint8Array[] = [];
            const reader = base.getReader();
            for (;;) {
                const r = await reader.read();
                if (r.done) break;
                parts.push(typeof r.value === "string" ? new TextEncoder().encode(r.value) : r.value);
            }
            return Buffer.concat(parts);
        },
    }) as G.ModalReadStream<any>;
    void chunks;
    return {
        stream,
        push(chunk) {
            controller.enqueue(mode === "text" ? decoder.decode(chunk, { stream: true }) : chunk);
        },
        end() {
            try {
                controller.close();
            } catch {
                // already closed
            }
        },
    };
}

function writeStream(cmd: DoCommand): G.ModalWriteStream<any> {
    const enc = new TextEncoder();
    const base = new WritableStream<any>({
        async write(chunk) {
            await wrap(() => cmd.writeStdin(typeof chunk === "string" ? enc.encode(chunk) : chunk));
        },
        async close() {
            await wrap(() => cmd.closeStdin());
        },
    });
    return Object.assign(base, {
        async writeText(text: string) {
            await wrap(() => cmd.writeStdin(text));
        },
        async writeBytes(bytes: Uint8Array) {
            await wrap(() => cmd.writeStdin(bytes));
        },
    }) as G.ModalWriteStream<any>;
}

/** The output and exit of one DigitalOcean command, split the way Modal exposes a process. */
class ProcessIO {
    readonly stdout: Feed;
    readonly stderr: Feed;
    readonly stdin: G.ModalWriteStream<any>;
    private code: number | undefined;
    private readonly finished: Promise<number>;

    constructor(readonly cmd: DoCommand, opts: { mode: Mode; stdout?: "pipe" | "ignore"; stderr?: "pipe" | "ignore" }) {
        const out = readFeed(opts.mode);
        const err = readFeed(opts.mode);
        this.stdout = out;
        this.stderr = err;
        this.stdin = writeStream(cmd);
        const pipeOut = opts.stdout !== "ignore";
        const pipeErr = opts.stderr !== "ignore";
        this.finished = (async () => {
            try {
                for await (const ev of cmd.stream()) {
                    if (ev.type === "stdout" && pipeOut) out.push(ev.data);
                    else if (ev.type === "stderr" && pipeErr) err.push(ev.data);
                    else if (ev.type === "exit") this.code = ev.exitCode;
                }
            } finally {
                out.end();
                err.end();
            }
            if (this.code === undefined) throw new G.InternalFailure(`the output stream of command ${cmd.pid} ended before it exited`);
            return this.code;
        })();
        this.finished.catch(() => undefined);
    }

    wait(): Promise<number> {
        return this.finished.catch((e) => {
            throw toModalError(e);
        });
    }

    poll(): number | null {
        return this.code ?? null;
    }
}

/** A process started with `sandbox.exec`. */
export class ContainerProcess<R extends string | Uint8Array = any> extends G.ContainerProcess<R> {
    private readonly io: ProcessIO;

    constructor(io: ProcessIO) {
        super();
        this.io = io;
        this.stdin = io.stdin as G.ModalWriteStream<R>;
        this.stdout = io.stdout.stream as G.ModalReadStream<R>;
        this.stderr = io.stderr.stream as G.ModalReadStream<R>;
    }

    async closeStdin(): Promise<void> {
        await wrap(() => this.io.cmd.closeStdin());
    }

    async wait(): Promise<number> {
        return this.io.wait();
    }

    async _poll(): Promise<number | null> {
        return this.io.poll();
    }
}

interface SandboxContext {
    base: ClientOptions;
    workdir?: string;
    entry?: ProcessIO;
}

/** Modal's `Sandbox`, on a DigitalOcean sandbox. */
export class Sandbox extends G.Sandbox {
    private readonly ds: DoSandbox;
    private readonly ctx: SandboxContext;

    constructor(ds: DoSandbox, ctx: SandboxContext) {
        super();
        this.ds = ds;
        this.ctx = ctx;
        (this as unknown as Record<string, unknown>).sandboxId = ds.sandboxId;
    }

    /** Standard input of the entrypoint command (`command` at create). Without one, writes fail. */
    get stdin(): G.ModalWriteStream<string> {
        if (this.ctx.entry) return this.ctx.entry.stdin as G.ModalWriteStream<string>;
        const noEntry = () => {
            throw new G.InvalidError("Sandbox.stdin: the sandbox has no entrypoint command; pass `command` to sandboxes.create or use exec");
        };
        return Object.assign(new WritableStream({ write: noEntry }), { writeText: noEntry, writeBytes: noEntry }) as unknown as G.ModalWriteStream<string>;
    }
    /** Output of the entrypoint command. Empty without one. */
    get stdout(): G.ModalReadStream<string> {
        if (this.ctx.entry) return this.ctx.entry.stdout.stream as G.ModalReadStream<string>;
        const empty = readFeed("text");
        empty.end();
        return empty.stream as G.ModalReadStream<string>;
    }
    get stderr(): G.ModalReadStream<string> {
        if (this.ctx.entry) return this.ctx.entry.stderr.stream as G.ModalReadStream<string>;
        const empty = readFeed("text");
        empty.end();
        return empty.stream as G.ModalReadStream<string>;
    }

    exec(command: string[], params?: G.SandboxExecParams & { mode?: "text" }): Promise<ContainerProcess<string>>;
    exec(command: string[], params: G.SandboxExecParams & { mode: "binary" }): Promise<ContainerProcess<Uint8Array>>;
    async exec(command: string[], params: G.SandboxExecParams = {}): Promise<any> {
        rejectExplicit(PLATFORM, "Sandbox.exec", params, { pty: "a PTY API" });
        if (!command?.length) throw new G.InvalidError("Sandbox.exec: `command` must not be empty");
        const env: Record<string, string> = {};
        for (const s of params.secrets ?? []) Object.assign(env, (s as Secret).values);
        Object.assign(env, params.env);
        const cmd = await wrap(() =>
            this.ds.commands.start(command[0], {
                args: command.slice(1),
                cwd: params.workdir ?? this.ctx.workdir,
                envVars: Object.keys(env).length ? env : undefined,
                stdin: true,
                timeoutSeconds: params.timeoutMs ? secondsFromMs(params.timeoutMs) : undefined,
            }),
        );
        return new ContainerProcess(new ProcessIO(cmd, { mode: params.mode === "binary" ? "binary" : "text", stdout: params.stdout, stderr: params.stderr }));
    }

    terminate(): Promise<void>;
    terminate(params: { wait: true }): Promise<number>;
    async terminate(params?: G.SandboxTerminateParams): Promise<any> {
        await wrap(() => this.ds.kill());
        if (params?.wait) return this.ctx.entry?.poll() ?? 0;
    }

    detach(): void {
        // Nothing is held open client side.
    }

    async wait(): Promise<number> {
        if (this.ctx.entry) return this.ctx.entry.wait();
        for (;;) {
            try {
                if ((await this.ds.getInfo()).state === "SANDBOX_STATE_PAUSED") return 0;
            } catch (e) {
                if (e instanceof Do.NotFoundError) return 0;
                throw toModalError(e);
            }
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    async poll(): Promise<number | null> {
        const code = this.ctx.entry?.poll();
        if (code !== null && code !== undefined) return code;
        try {
            const info = await this.ds.getInfo();
            return info.state === "SANDBOX_STATE_RUNNING" || info.state === "SANDBOX_STATE_CREATING" ? null : 0;
        } catch (e) {
            if (e instanceof Do.NotFoundError) return 0;
            throw toModalError(e);
        }
    }

    async waitUntilReady(timeoutMs?: number): Promise<void> {
        await wrap(() => this.ds.waitUntilRunning({ timeoutMs }));
    }

    async experimentalPause(): Promise<void> {
        await wrap(() => this.ds.pause());
    }

    async experimentalResume(): Promise<void> {
        await wrap(() => this.ds.resume());
    }
}

const CREATE_UNSUPPORTED = {
    cpuLimit: "separate CPU limits (sizes are slugs)",
    memoryLimitMiB: "separate memory limits (sizes are slugs)",
    runtime: "a sandbox runtime API",
    gpu: "GPU sandboxes",
    timeoutMs: "a sandbox lifetime API",
    idleTimeoutMs: "a sandbox lifetime API",
    volumes: "a volumes API",
    cloudBucketMounts: "a volumes API",
    pty: "a PTY API",
    encryptedPorts: "a ports and tunnels API",
    h2Ports: "a ports and tunnels API",
    unencryptedPorts: "a ports and tunnels API",
    outboundCidrAllowlist: "a network policy API",
    outboundDomainAllowlist: "a network policy API",
    experimentalOutboundPolicy: "a network policy API",
    inboundCidrAllowlist: "a network policy API",
    i6pn: "a network policy API",
    cloud: "a region API",
    regions: "a region API",
    proxy: "a proxy API",
    readinessProbe: "a readiness probe API",
    name: "sandbox names",
    tags: "a sandbox metadata API",
    experimentalOptions: "Modal experimental options",
    customDomain: "a ports and tunnels API",
    includeOidcIdentityToken: "an identity token API",
    experimentalEnableSnapshot: "a snapshot restore API",
    experimentalPersistent: "persistent sandboxes",
} as const;

export class SandboxService extends G.SandboxService {
    constructor(private readonly base: ClientOptions) {
        super();
    }

    /** `image` must come from `images.fromRegistry`. Its template is built on first use. */
    async create(app: G.App, image: G.Image, params: G.SandboxCreateParams = {}): Promise<Sandbox> {
        void app;
        rejectExplicit(PLATFORM, "SandboxService.create", params, CREATE_UNSUPPORTED);
        if (!(image instanceof Image)) {
            throw new NotImplementedError(`${PLATFORM}: SandboxService.create with this Image is not implemented on DigitalOcean Sandboxes yet: needs image layers (use images.fromRegistry(tag))`, "SandboxService.create", PLATFORM);
        }
        const size = sizeFor(params.cpu, params.memoryMiB);
        const env: Record<string, string> = {};
        for (const s of params.secrets ?? []) Object.assign(env, (s as Secret).values);
        Object.assign(env, params.env);
        const template = await ensureTemplate(this.base, image.tag);
        const ds = await wrap(() =>
            DoSandbox.create({
                ...this.base,
                template,
                size,
                envVars: Object.keys(env).length ? env : undefined,
                allowInternetAccess: params.blockNetwork ? false : undefined,
            }),
        );
        const ctx: SandboxContext = { base: this.base, workdir: params.workdir };
        if (params.command?.length) {
            const cmd = await wrap(() => ds.commands.start(params.command![0], { args: params.command!.slice(1), cwd: params.workdir, stdin: true }));
            ctx.entry = new ProcessIO(cmd, { mode: "text" });
        }
        return new Sandbox(ds, ctx);
    }

    async fromId(sandboxId: string): Promise<Sandbox> {
        return new Sandbox(await wrap(() => DoSandbox.get(sandboxId, this.base)), { base: this.base });
    }

    list(params?: G.SandboxListParams): AsyncGenerator<Sandbox, void, unknown> {
        rejectExplicit(PLATFORM, "SandboxService.list", params, { appId: "sandbox apps", tags: "a sandbox metadata API" });
        const base = this.base;
        async function* run(): AsyncGenerator<Sandbox, void, unknown> {
            for await (const ds of DoSandbox.list({ ...base, state: "SANDBOX_STATE_RUNNING" })) yield new Sandbox(ds, { base });
        }
        return run();
    }
}

/**
 * The Modal client, on DigitalOcean Sandboxes. Also exported as `ModalClient`.
 */
export class ModalClient extends G.ModalClient {
    constructor(params?: G.ModalClientParams) {
        super(params);
        const base: ClientOptions = { token: params?.tokenSecret };
        const self = this as unknown as Record<string, unknown>;
        self.apps = new AppService(this);
        self.images = new ImageService(base);
        self.sandboxes = new SandboxService(base);
        self.secrets = new SecretService(this);
        for (const key of ["cloudBucketMounts", "cls", "environments", "functions", "functionCalls", "proxies", "queues", "sandboxSnapshots", "volumes"]) {
            const Cls = SERVICES[key];
            self[key] = Object.create(Cls.prototype);
        }
    }

    close(): void {
        // Nothing is held open.
    }

    version(): string {
        return `${VERSION}-do-compat`;
    }

    environmentName(environment?: string): string {
        return environment ?? "main";
    }
}

const SERVICES: Record<string, { prototype: object }> = {
    cloudBucketMounts: G.CloudBucketMountService,
    cls: G.ClsService,
    environments: G.EnvironmentService,
    functions: G.FunctionService,
    functionCalls: G.FunctionCallService,
    proxies: G.ProxyService,
    queues: G.QueueService,
    sandboxSnapshots: G.SandboxSnapshotService,
    volumes: G.VolumeService,
};

/** The members this overlay serves. Everything else in `generated.ts` throws {@link NotImplementedError}. */
export const IMPLEMENTED: ReadonlySet<string> = new Set([
    "AppService.fromName", "App.constructor", "SecretService.fromObject", "Secret.secretId", "ImageService.fromRegistry",
    "Image.imageId", "Image.build",
    "ContainerProcess.closeStdin", "ContainerProcess.wait", "ContainerProcess._poll",
    "Sandbox.stdin", "Sandbox.stdout", "Sandbox.stderr", "Sandbox.exec", "Sandbox.terminate", "Sandbox.detach", "Sandbox.wait",
    "Sandbox.poll", "Sandbox.waitUntilReady", "Sandbox.experimentalPause", "Sandbox.experimentalResume",
    "SandboxService.create", "SandboxService.fromId", "SandboxService.list",
    "ModalClient.close", "ModalClient.version", "ModalClient.environmentName",
]);

/** The classes the compat tests walk, by name. */
export const CLASSES: Readonly<Record<string, unknown>> = {
    ...G, App, AppService, Secret, SecretService, Image, ImageService, ContainerProcess, Sandbox, SandboxService, ModalClient,
};
