/**
 * Harness Runtime SDK: `@digitalocean/dots/harness-runtime`.
 *
 * A hand-written layer over the generated client for the Harness Runtime API.
 * It adds what the generated client cannot do (live events, port-forward, the
 * checksum on downloads) and removes the ceremony it requires (polling until a
 * session is ready, paging, nullable responses, untyped errors).
 *
 * ```ts
 * import { HarnessRuntime } from "@digitalocean/dots/harness-runtime";
 * const hr = new HarnessRuntime();                 // reads DIGITALOCEAN_TOKEN
 * const session = await hr.sessions.create({ manifest });
 * const result = await session.run("Fix the failing test", { onText: (t) => process.stdout.write(t) });
 * ```
 */

import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient, type DigitalOceanClient } from "../digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../DigitalOceanApiKeyAuthenticationProvider.js";
import { DEFAULT_BASE_URL } from "../streaming/harnessStream.js";
import type { WebSocketFactory } from "../streaming/portForward.js";
import type { Workspace } from "../models/index.js";
import { call, HarnessRuntimeError, required, TimeoutError } from "./errors.js";
import {
    Environments,
    paginate,
    Session,
    Sessions,
    type PersistentWorkspace,
    type RuntimeContext,
} from "./session.js";
import { Triggers } from "./triggers.js";

/** Options for {@link HarnessRuntime}. */
export interface HarnessRuntimeOptions {
    /** A DigitalOcean API token. Defaults to the `DIGITALOCEAN_TOKEN` environment variable. */
    token?: string;
    /** The API endpoint. Defaults to https://api.digitalocean.com. */
    baseUrl?: string;
    /**
     * Builds port-forward sockets. Needed under Node, where the platform
     * WebSocket cannot send the Authorization header, for example with `ws`:
     * `(url, headers) => new WebSocket(url, { headers })`.
     */
    webSocketFactory?: WebSocketFactory;
    /** How often waits poll the API. Defaults to 2 s. */
    pollIntervalMs?: number;
    /** Overrides fetch for the streaming calls. Mainly for tests. */
    fetchImpl?: typeof fetch;
}

/** The Harness Runtime API. */
export class HarnessRuntime {
    readonly environments: Environments;
    readonly sessions: Sessions;
    readonly sandboxes: Sandboxes;
    readonly workspaces: Workspaces;
    readonly triggers: Triggers;
    /** The generated client, for anything this layer does not cover. */
    readonly client: DigitalOceanClient;

    constructor(options: HarnessRuntimeOptions = {}) {
        const token = options.token ?? envToken();
        if (!token) {
            throw new Error("no API token: pass `token` or set DIGITALOCEAN_TOKEN");
        }
        const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
        const adapter = new FetchRequestAdapter(authProvider);
        adapter.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
        this.client = createDigitalOceanClient(adapter);

        const ctx: RuntimeContext = {
            client: this.client,
            adapter,
            transport: { authProvider, baseUrl: adapter.baseUrl, fetchImpl: options.fetchImpl },
            webSocketFactory: options.webSocketFactory,
            pollIntervalMs: options.pollIntervalMs ?? 2_000,
        };
        this.environments = new Environments(ctx);
        this.sessions = new Sessions(ctx);
        this.sandboxes = new Sandboxes(this.sessions);
        this.workspaces = new Workspaces(ctx);
        this.triggers = new Triggers(ctx);
    }
}

/**
 * Bare sandboxes: sessions with no agent, driven with `exec`, `spawn`,
 * `files` and `portForward`.
 */
export class Sandboxes {
    constructor(private readonly sessions: Sessions) {}

    /**
     * Creates a sandbox and returns once it is ready. `template` picks a
     * catalog template; the server's default has no agent installed.
     */
    create(options: { template?: string; name?: string; wait?: boolean; timeoutMs?: number } = {}): Promise<Session> {
        const { template, ...rest } = options;
        return this.sessions.create({ ...rest, manifest: { harness: "sandbox", ...(template ? { template } : {}) } });
    }
}

/** Persistent workspaces: volumes that outlive sessions and mount at `/workspace`. */
export class Workspaces {
    constructor(private readonly ctx: RuntimeContext) {}

    async create(input: { name: string; sizeLimitGib: number }): Promise<PersistentWorkspace> {
        const res = await call(() => this.ctx.client.v2.agents.workspaces.post(input));
        return toWorkspace(res?.workspace);
    }

    async get(id: string): Promise<PersistentWorkspace> {
        const res = await call(() => this.ctx.client.v2.agents.workspaces.byWorkspace_id(id).get());
        return toWorkspace(res?.workspace);
    }

    list(): AsyncGenerator<PersistentWorkspace> {
        return paginate(async (pageToken) => {
            const res = await call(() => this.ctx.client.v2.agents.workspaces.get({ queryParameters: { pageToken } }));
            return { items: (res?.workspaces ?? []).map(toWorkspace), nextPageToken: res?.nextPageToken };
        });
    }

    async delete(id: string): Promise<void> {
        await call(() => this.ctx.client.v2.agents.workspaces.byWorkspace_id(id).delete());
    }

    /**
     * Polls until the workspace is AVAILABLE, which it is again once the session
     * that held it has released it. Attach it to a new session, or delete it,
     * after this returns. A workspace that fails or is being deleted raises an
     * error.
     */
    async waitUntilAvailable(id: string, options: { timeoutMs?: number } = {}): Promise<PersistentWorkspace> {
        const deadline = Date.now() + (options.timeoutMs ?? 5 * 60_000);
        for (;;) {
            const workspace = await this.get(id);
            const state = workspace.raw.state ?? "";
            if (state === "AVAILABLE") return workspace;
            if (state === "FAILED" || state === "DELETING") {
                throw new HarnessRuntimeError(`workspace ${id} cannot become available: ${state}`, 0);
            }
            if (Date.now() >= deadline) {
                throw new TimeoutError(`workspace ${id} was not available in time (last state ${state})`);
            }
            await new Promise((resolve) => setTimeout(resolve, this.ctx.pollIntervalMs));
        }
    }
}

function toWorkspace(workspace: Workspace | null | undefined): PersistentWorkspace {
    const raw = required(workspace, "the workspace");
    return { id: required(raw.workspaceId, "the workspace id"), name: raw.name ?? "", raw };
}

function envToken(): string | undefined {
    return typeof process !== "undefined" ? process.env?.DIGITALOCEAN_TOKEN : undefined;
}

export {
    ConflictError,
    HarnessRuntimeError,
    InvalidRequestError,
    LockedError,
    NotEnabledError,
    NotFoundError,
    PaymentRequiredError,
    RateLimitError,
    ServiceError,
    SessionFailedError,
    TimeoutError,
    UnauthorizedError,
} from "./errors.js";
export {
    Environments,
    Session,
    SessionFiles,
    Sessions,
    type ApprovalRequest,
    type CreateSessionInput,
    type Environment,
    type Manifest,
    type PersistentWorkspace,
    type RunOptions,
    type RunResult,
} from "./session.js";
export { ExecProcess, type ExecOptions, type ExecResult, type SpawnOptions } from "./exec.js";
export {
    TriggerHandle,
    Triggers,
    type TriggerExecution,
    type TriggerInput,
    type TriggerOutput,
    type TriggerTarget,
    type WebhookSetup,
} from "./triggers.js";
export type { SessionEvent, SessionEventReplay } from "../streaming/sessionEvents.js";
export type { PortForwardTunnel, WebSocketFactory } from "../streaming/portForward.js";
