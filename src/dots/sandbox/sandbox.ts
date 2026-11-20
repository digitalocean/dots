/**
 * DigitalOcean Sandbox SDK over `/v2/sandboxes`.
 *
 * Hand-written: `make generate` does not touch `src/dots/sandbox/`. Every call goes
 * through the generated Kiota client, so auth, retries and User-Agent match
 * the rest of the SDK.
 *
 * ```ts
 * import { Sandbox } from "@digitalocean/dots/sandbox";
 * const sandbox = await Sandbox.create({ template: "base" });
 * await sandbox.pause();
 * await sandbox.resume();
 * await sandbox.kill();
 * ```
 */

import type { DigitalOceanClient } from "../digitalOceanClient.js";
import { connect, rejectUnknownOptions, type ClientOptions } from "./config.js";
import { call, NotFoundError, required, SandboxError, SandboxTimeoutError } from "./errors.js";
import { toInfo, type SandboxInfo, type SandboxState } from "./types.js";

/** `size_slug` used when `size` is omitted. The API requires one and it must be an enabled size. */
export const DEFAULT_SIZE = "mars-2vcpu-4gb";

export interface SandboxCreateOptions extends ClientOptions {
    /** Template to create the sandbox from. Required. */
    template: string;
    /** Size slug. Defaults to {@link DEFAULT_SIZE}. */
    size?: string;
    /** `false` limits egress to the platform file-transfer host. Defaults to unrestricted. */
    allowInternetAccess?: boolean;
    /** Environment variables for the sandbox. The values are secrets. */
    envVars?: Record<string, string>;
}

export interface SandboxListOptions extends ClientOptions {
    /** Return only sandboxes in this state. */
    state?: SandboxState;
    /** Page size. */
    limit?: number;
    /** Resume after the `nextToken` of an earlier page. */
    nextToken?: string;
}

export interface WaitOptions {
    /** Defaults to 2 minutes. */
    timeoutMs?: number;
    /** Defaults to 1 s. */
    pollIntervalMs?: number;
}

const CREATE_KEYS = ["template", "size", "allowInternetAccess", "envVars"];
const LIST_KEYS = ["state", "limit", "nextToken"];

export class Sandbox {
    /** The record as last returned by the API. Call {@link getInfo} to refresh it. */
    info: SandboxInfo;

    private constructor(
        private readonly client: DigitalOceanClient,
        info: SandboxInfo,
    ) {
        this.info = info;
    }

    get sandboxId(): string {
        return this.info.sandboxId;
    }
    get state(): SandboxState {
        return this.info.state;
    }
    get template(): string {
        return this.info.template;
    }

    /** Creates a sandbox. Resolves once it is running. */
    static async create(opts: SandboxCreateOptions): Promise<Sandbox> {
        rejectUnknownOptions(opts ?? {}, CREATE_KEYS, "Sandbox.create");
        if (!opts?.template?.trim()) {
            throw new SandboxError("Sandbox.create: `template` is required, e.g. Sandbox.create({ template: 'base' })");
        }
        const client = connect(opts);
        const res = await call(() =>
            client.v2.sandboxes.post({
                template: opts.template,
                sizeSlug: opts.size ?? DEFAULT_SIZE,
                allowInternetAccess: opts.allowInternetAccess,
                envVars: opts.envVars ? { additionalData: { ...opts.envVars } } : undefined,
            }),
        );
        return new Sandbox(client, toInfo(res?.sandbox));
    }

    /** Fetches a sandbox by id. */
    static async get(sandboxId: string, opts: ClientOptions = {}): Promise<Sandbox> {
        const client = connect(opts);
        return new Sandbox(client, await fetchInfo(client, sandboxId));
    }

    /** Fetches a sandbox by id and resumes it if it is paused. */
    static async connect(sandboxId: string, opts: ClientOptions = {}): Promise<Sandbox> {
        const sandbox = await Sandbox.get(sandboxId, opts);
        if (sandbox.state === "SANDBOX_STATE_PAUSED") await sandbox.resume();
        return sandbox;
    }

    /**
     * Lists the team's sandboxes. Iterate it to walk every page, or call
     * `nextItems()` for one page at a time.
     */
    static list(opts: SandboxListOptions = {}): SandboxPaginator {
        rejectUnknownOptions(opts, LIST_KEYS, "Sandbox.list");
        return new SandboxPaginator(connect(opts), opts);
    }

    /** Deletes a sandbox by id. Resolves `false` when it does not exist. */
    static async kill(sandboxId: string, opts: ClientOptions = {}): Promise<boolean> {
        return deleteSandbox(connect(opts), sandboxId);
    }

    /** Pauses a sandbox by id. */
    static async pause(sandboxId: string, opts: ClientOptions = {}): Promise<SandboxInfo> {
        return pauseSandbox(connect(opts), sandboxId);
    }

    /** Reads the sandbox again. */
    async getInfo(): Promise<SandboxInfo> {
        this.info = await fetchInfo(this.client, this.sandboxId);
        return this.info;
    }

    /** True when the sandbox is running right now. Reads the API. */
    async isRunning(): Promise<boolean> {
        return (await this.getInfo()).state === "SANDBOX_STATE_RUNNING";
    }

    /** Pauses the sandbox. Resume it to use it again. */
    async pause(): Promise<SandboxInfo> {
        this.info = await pauseSandbox(this.client, this.sandboxId);
        return this.info;
    }

    /** Resumes a paused sandbox. */
    async resume(): Promise<SandboxInfo> {
        const res = await call(() => this.client.v2.sandboxes.bySandbox_id(this.sandboxId).resume.post());
        this.info = toInfo(res?.sandbox);
        return this.info;
    }

    /** Deletes the sandbox. Resolves `false` when it is already gone. */
    async kill(): Promise<boolean> {
        return deleteSandbox(this.client, this.sandboxId);
    }

    /** Polls until the sandbox is running. Raises if it is paused or the wait runs out. */
    async waitUntilRunning(opts: WaitOptions = {}): Promise<this> {
        const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
        for (;;) {
            const { state } = this.info;
            if (state === "SANDBOX_STATE_RUNNING") return this;
            if (state !== "SANDBOX_STATE_CREATING") {
                throw new SandboxError(`sandbox ${this.sandboxId} will not become running: ${state}`);
            }
            if (Date.now() >= deadline) {
                throw new SandboxTimeoutError(`sandbox ${this.sandboxId} was not running in time (last state ${state})`);
            }
            await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 1_000));
            await this.getInfo();
        }
    }

    /** `await using sandbox = await Sandbox.create(...)` kills the sandbox at scope exit. */
    async [Symbol.asyncDispose](): Promise<void> {
        await this.kill();
    }
}

/** One page at a time via `nextItems()`, or every sandbox via `for await`. */
export class SandboxPaginator implements AsyncIterable<Sandbox> {
    private token: string | undefined;
    private started = false;

    /** @internal */
    constructor(
        private readonly client: DigitalOceanClient,
        private readonly opts: SandboxListOptions,
    ) {
        this.token = opts.nextToken || undefined;
    }

    /** True until a page came back without a next-page token. */
    get hasNext(): boolean {
        return !this.started || this.token !== undefined;
    }

    /** The token that resumes after the last page read, if there is one. */
    get nextToken(): string | undefined {
        return this.token;
    }

    async nextItems(): Promise<Sandbox[]> {
        if (!this.hasNext) throw new SandboxError("no more sandboxes to list");
        const res = await call(() =>
            this.client.v2.sandboxes.get({
                queryParameters: { pageSize: this.opts.limit, pageToken: this.token, state: this.opts.state },
            }),
        );
        this.started = true;
        this.token = res?.nextPageToken || undefined;
        return (res?.sandboxes ?? []).map((m) => new (Sandbox as any)(this.client, toInfo(m)) as Sandbox);
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<Sandbox> {
        while (this.hasNext) yield* await this.nextItems();
    }
}

async function fetchInfo(client: DigitalOceanClient, sandboxId: string): Promise<SandboxInfo> {
    const res = await call(() => client.v2.sandboxes.bySandbox_id(requireId(sandboxId)).get());
    return toInfo(required(res, "the sandbox").sandbox);
}

async function pauseSandbox(client: DigitalOceanClient, sandboxId: string): Promise<SandboxInfo> {
    const res = await call(() => client.v2.sandboxes.bySandbox_id(requireId(sandboxId)).pause.post());
    return toInfo(res?.sandbox);
}

async function deleteSandbox(client: DigitalOceanClient, sandboxId: string): Promise<boolean> {
    try {
        await call(() => client.v2.sandboxes.bySandbox_id(requireId(sandboxId)).delete());
        return true;
    } catch (err) {
        if (err instanceof NotFoundError) return false;
        throw err;
    }
}

function requireId(sandboxId: string): string {
    if (!sandboxId?.trim()) throw new SandboxError("`sandboxId` is required");
    return sandboxId;
}
