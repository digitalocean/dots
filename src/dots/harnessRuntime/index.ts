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
 * const hr = new HarnessRuntime();                 // reads DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL, if set)
 * const session = await hr.sessions.create({ manifest });
 * const result = await session.run("Fix the failing test", { onText: (t) => process.stdout.write(t) });
 * ```
 */

import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient, type DigitalOceanClient } from "../digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../DigitalOceanApiKeyAuthenticationProvider.js";
import { DEFAULT_BASE_URL } from "../streaming/harnessStream.js";
import type { WebSocketFactory } from "../streaming/portForward.js";
import type {
    Provider_connection,
    Provider_connection_authorization,
    Provider_connection_response,
    Sandbox_template,
    Sandbox_template_build,
    Workspace,
    Workspace_state,
} from "../models/index.js";
import { call, ConflictError, HarnessRuntimeError, required, TimeoutError } from "./errors.js";
import {
    Environments,
    paginate,
    Sessions,
    type PersistentWorkspace,
    type RuntimeContext,
} from "./session.js";
import { Triggers } from "./triggers.js";

/** Options for {@link HarnessRuntime}. */
export interface HarnessRuntimeOptions {
    /** A DigitalOcean API token. Defaults to the `DIGITALOCEAN_ACCESS_TOKEN` environment variable. */
    token?: string;
    /** The API endpoint. Defaults to the `DIGITALOCEAN_API_URL` environment variable, then https://api.digitalocean.com. */
    baseUrl?: string;
    /**
     * A region slug from `regions.list()`, such as `mem1`. Calls that region's
     * API host, `https://api-<region>.digitalocean.com`, and the API places new
     * sessions in the region of the host it was called on. Leave it out for the
     * default region. Cannot be combined with `baseUrl`.
     */
    region?: string;
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
    readonly workspaces: Workspaces;
    readonly triggers: Triggers;
    readonly regions: Regions;
    readonly connections: Connections;
    readonly templates: Templates;
    /** The generated client, for anything this layer does not cover. */
    readonly client: DigitalOceanClient;

    constructor(options: HarnessRuntimeOptions = {}) {
        const token = options.token ?? env("DIGITALOCEAN_ACCESS_TOKEN");
        if (!token) {
            throw new Error("no API token: pass `token` or set DIGITALOCEAN_ACCESS_TOKEN");
        }
        const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
        const adapter = new FetchRequestAdapter(authProvider);
        adapter.baseUrl = regionalHost(options) ?? options.baseUrl ?? env("DIGITALOCEAN_API_URL") ?? DEFAULT_BASE_URL;
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
        this.workspaces = new Workspaces(ctx);
        this.triggers = new Triggers(ctx);
        this.regions = new Regions(ctx);
        this.connections = new Connections(ctx);
        this.templates = new Templates(ctx);
    }
}

function regionalHost(options: HarnessRuntimeOptions): string | undefined {
    if (options.region === undefined) return undefined;
    if (options.baseUrl !== undefined) throw new Error("pass `region` or `baseUrl`, not both");
    // The slug becomes part of a hostname the token is sent to, so only a plain slug is accepted.
    if (!/^[a-z0-9]+$/.test(options.region)) throw new Error(`not a region slug: ${JSON.stringify(options.region)}`);
    return `https://api-${options.region}.digitalocean.com`;
}

/** A region the team can place sessions in. */
export interface Region {
    /** The datacenter slug, such as `mem1`. Pass it as `region` to work there. */
    slug: string;
    /** The region https://api.digitalocean.com serves. */
    isDefault: boolean;
}

/** The regions the team can place sessions in. */
export class Regions {
    constructor(private readonly ctx: RuntimeContext) {}

    /**
     * Lists the regions open to the team, sorted by slug. The default region is
     * always listed; a region missing from the list refuses creates.
     */
    async list(): Promise<Region[]> {
        const res = await call(() => this.ctx.client.v2.harnessRuntime.regions.get());
        return (res?.regions ?? []).map((r) => ({ slug: required(r.slug, "the region slug"), isDefault: r.isDefault ?? false }));
    }
}

/** Persistent workspaces: volumes that outlive sessions and mount at `/workspace`. */
export class Workspaces {
    constructor(private readonly ctx: RuntimeContext) {}

    /**
     * Creates a workspace. With `idempotencyKey`, a retry with the same key and
     * input within 24 hours returns the workspace the first call created
     * instead of a second one; the same key with different input is refused
     * with a 422.
     */
    async create(input: { name: string; sizeLimitGib: number; idempotencyKey?: string }): Promise<PersistentWorkspace> {
        const { idempotencyKey, ...body } = input;
        const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
        const res = await call(() => this.ctx.client.v2.harnessRuntime.workspaces.post(body, { headers }));
        return toWorkspace(res?.workspace);
    }

    async get(id: string): Promise<PersistentWorkspace> {
        const res = await call(() => this.ctx.client.v2.harnessRuntime.workspaces.byWorkspace_id(id).get());
        return toWorkspace(res?.workspace);
    }

    /** Lists the team's workspaces, or only those in `state`, such as `AVAILABLE`. */
    list(options: { state?: Workspace_state } = {}): AsyncGenerator<PersistentWorkspace> {
        return paginate(async (pageToken) => {
            const res = await call(() =>
                this.ctx.client.v2.harnessRuntime.workspaces.get({ queryParameters: { pageToken, state: options.state } }),
            );
            return { items: (res?.workspaces ?? []).map(toWorkspace), nextPageToken: res?.nextPageToken };
        });
    }

    async delete(id: string): Promise<void> {
        await call(() => this.ctx.client.v2.harnessRuntime.workspaces.byWorkspace_id(id).delete());
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

/** A provider connection: the account an agent acts as, such as a GitHub login. No token is ever returned. */
export interface Connection {
    id: string;
    provider: string;
    /** The actor the connection acts for, chosen by you. Not a DigitalOcean user id. */
    userId: string;
    /** `pending` until the user finishes logging in, then `active`; also `expired` or `revoked`. */
    status: string;
    raw: Provider_connection;
}

/** A connection, with the login step the user still has to complete, if any. */
export interface ConnectionResult {
    connection: Connection;
    /** Present while login is outstanding: open `connectUrl` and enter `verificationCode`. */
    authorization?: Provider_connection_authorization;
}

/**
 * Provider connections (OAuth): the accounts agents act as. `github` is the
 * provider served today and the default for every method.
 */
export class Connections {
    constructor(private readonly ctx: RuntimeContext) {}

    private provider(provider: string) {
        return this.ctx.client.v2.harnessRuntime.auth.byProvider(provider).connections;
    }

    /**
     * Creates the connection for `userId`, which starts `pending` with an
     * `authorization` for the user to complete. Each actor has one connection
     * per provider: a second create raises `ConflictError`; use `connect` to
     * reuse the existing one instead.
     */
    async create(input: { userId: string; scopes?: string[]; provider?: string }): Promise<ConnectionResult> {
        const res = await call(() =>
            this.provider(input.provider ?? "github").post({ userId: input.userId, scopes: input.scopes }),
        );
        return toConnectionResult(res);
    }

    /**
     * Creates the connection for `userId`, or, when the actor already has one,
     * reconnects that one, which keeps its id and scopes (the `scopes` given
     * here then apply only to a new connection).
     */
    async connect(input: { userId: string; scopes?: string[]; provider?: string }): Promise<ConnectionResult> {
        try {
            return await this.create(input);
        } catch (err) {
            if (!(err instanceof ConflictError)) throw err;
        }
        const provider = input.provider ?? "github";
        for await (const existing of this.list({ provider, userId: input.userId })) {
            return this.reconnect(existing.id, provider);
        }
        throw new HarnessRuntimeError(`the connection for ${input.userId} exists but was not listed`, 0);
    }

    async get(id: string, provider = "github"): Promise<Connection> {
        const res = await call(() => this.provider(provider).byConnection_id(id).get());
        return toConnection(res?.connection);
    }

    /** Lists the team's connections, revoked ones excepted, optionally for one actor or status. */
    async *list(options: { provider?: string; userId?: string; status?: string } = {}): AsyncGenerator<Connection> {
        for (let page = 1; ; page++) {
            const res = await call(() =>
                this.provider(options.provider ?? "github").get({
                    queryParameters: { page, userId: options.userId, status: options.status },
                }),
            );
            const items = res?.connections ?? [];
            for (const item of items) yield toConnection(item);
            const total = res?.pagination?.total ?? 0;
            const perPage = res?.pagination?.perPage || items.length;
            if (items.length === 0 || page * perPage >= total) return;
        }
    }

    /**
     * Resumes a pending login or starts a new one for an expired or revoked
     * connection, keeping its id and scopes. An active connection comes back
     * unchanged. Only the member who created it can reconnect it.
     */
    async reconnect(id: string, provider = "github"): Promise<ConnectionResult> {
        const res = await call(() => this.provider(provider).byConnection_id(id).reconnect.post());
        return toConnectionResult(res);
    }

    /**
     * Revokes the connection. One that an environment config still uses is
     * kept, and the error names those configs.
     */
    async delete(id: string, provider = "github"): Promise<void> {
        await call(() => this.provider(provider).byConnection_id(id).delete());
    }
}

function toConnection(connection: Provider_connection | null | undefined): Connection {
    const raw = required(connection, "the connection");
    return {
        id: required(raw.id, "the connection id"),
        provider: raw.provider ?? "",
        userId: raw.userId ?? "",
        status: raw.status ?? "",
        raw,
    };
}

function toConnectionResult(res: Provider_connection_response | undefined): ConnectionResult {
    return { connection: toConnection(res?.connection), authorization: res?.authorization ?? undefined };
}

/** A team template: a sandbox image built from your OCI image on top of a base template. */
export interface Template {
    id: string;
    name: string;
    /** `TEMPLATE_STATUS_BUILDING`, then `TEMPLATE_STATUS_READY` or `TEMPLATE_STATUS_FAILED`. */
    status: string;
    raw: Sandbox_template;
}

/** The team's templates. Global templates are listed too but cannot be changed or deleted. */
export class Templates {
    constructor(private readonly ctx: RuntimeContext) {}

    private item(id: string) {
        return this.ctx.client.v2.harnessRuntime.templates.byTemplate_id(id);
    }

    /**
     * Creates a template from `image`, a full OCI reference such as
     * `docker.io/library/ubuntu:24.04` (Debian or Ubuntu based), rebased onto
     * `baseTemplate`, such as `coding-base`. The build starts at once; call
     * `waitUntilReady` before using it.
     */
    async create(input: { name: string; baseTemplate: string; image: string }): Promise<Template> {
        const res = await call(() =>
            this.ctx.client.v2.harnessRuntime.templates.post({
                name: input.name,
                baseTemplate: input.baseTemplate,
                sourceOciRef: input.image,
            }),
        );
        return toTemplate(res?.template);
    }

    async get(id: string): Promise<Template> {
        const res = await call(() => this.item(id).get());
        return toTemplate(res?.template);
    }

    list(): AsyncGenerator<Template> {
        return paginate(async (pageToken) => {
            const res = await call(() => this.ctx.client.v2.harnessRuntime.templates.get({ queryParameters: { pageToken } }));
            return { items: (res?.templates ?? []).map(toTemplate), nextPageToken: res?.nextPageToken };
        });
    }

    /** Changes the template's image or base template, which starts a new build. */
    async update(id: string, input: { image?: string; baseTemplate?: string }): Promise<Template> {
        const res = await call(() => this.item(id).put({ sourceOciRef: input.image, baseTemplate: input.baseTemplate }));
        return toTemplate(res?.template);
    }

    async delete(id: string): Promise<void> {
        await call(() => this.item(id).delete());
    }

    /** The template's builds. A failed build's `errorEscaped` says why. */
    builds(id: string): AsyncGenerator<Sandbox_template_build> {
        return paginate(async (pageToken) => {
            const res = await call(() => this.item(id).builds.get({ queryParameters: { pageToken } }));
            return { items: res?.builds ?? [], nextPageToken: res?.nextPageToken };
        });
    }

    /**
     * Polls until the template's build ends, 20 minutes at most by default. A
     * failed build raises an error with the build's reason.
     */
    async waitUntilReady(id: string, options: { timeoutMs?: number } = {}): Promise<Template> {
        const deadline = Date.now() + (options.timeoutMs ?? 20 * 60_000);
        for (;;) {
            const template = await this.get(id);
            if (template.status === "TEMPLATE_STATUS_READY") return template;
            if (template.status === "TEMPLATE_STATUS_FAILED") {
                let latest: Sandbox_template_build | undefined;
                for await (const build of this.builds(id)) {
                    if (!latest || (build.createdAt ?? 0) > (latest.createdAt ?? 0)) latest = build;
                }
                const reason = latest?.errorEscaped ? `: ${latest.errorEscaped}` : "";
                throw new HarnessRuntimeError(`template ${template.name} failed to build${reason}`, 0);
            }
            if (Date.now() >= deadline) {
                throw new TimeoutError(`template ${template.name} was not built in time (last status ${template.status})`);
            }
            await new Promise((resolve) => setTimeout(resolve, this.ctx.pollIntervalMs));
        }
    }
}

function toTemplate(template: Sandbox_template | null | undefined): Template {
    const raw = required(template, "the template");
    return { id: required(raw.templateId, "the template id"), name: raw.name ?? "", status: raw.status ?? "", raw };
}

function toWorkspace(workspace: Workspace | null | undefined): PersistentWorkspace {
    const raw = required(workspace, "the workspace");
    return { id: required(raw.workspaceId, "the workspace id"), name: raw.name ?? "", raw };
}

function env(name: string): string | undefined {
    return (typeof process !== "undefined" && process.env?.[name]) || undefined;
}

export {
    ConfigUpdateFailedError,
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
    Sessions,
    type ApprovalRequest,
    type CancelOutcome,
    type ConfigUpdate,
    type ConfigUpdateResult,
    type CreateSessionInput,
    type Environment,
    type ManagedKeyOption,
    type Manifest,
    type PersistentWorkspace,
    type RunOptions,
    type RunResult,
} from "./session.js";
export { SessionFiles, type FileOptions, type UploadData } from "./files.js";
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
