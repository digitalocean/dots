import type { AgentSandbox } from "./agentSandbox.js";
import type { ClientOptions } from "./config.js";
import {
    Sandbox,
    type AgentSandboxCreateOptions,
    type SandboxCreateOptions,
    type SandboxGetOptions,
    type SandboxListOptions,
    type SessionGetOptions,
    type SessionListOptions,
    type SandboxPaginator,
} from "./sandbox.js";
import { Snapshot, type SnapshotCreateOptions, type SnapshotListOptions } from "./snapshots.js";
import { Template, type Pages, type TemplateCreateOptions, type TemplateListOptions } from "./templates.js";
import type { SandboxInfo } from "./types.js";

/**
 * Binds connection options once. Per-call options win.
 *
 * ```ts
 * const client = new SandboxClient({ token: process.env.DIGITALOCEAN_ACCESS_TOKEN });
 * const sandbox = await client.Sandbox.create({ template: "coding-base" });
 * ```
 */
export class SandboxClient {
    readonly Sandbox: {
        create(opts?: SandboxCreateOptions): Promise<Sandbox>;
        create(opts: AgentSandboxCreateOptions): Promise<AgentSandbox>;
        getSession(sessionId: string, opts?: ClientOptions): Promise<AgentSandbox>;
        get(sandboxId: string, opts?: SandboxGetOptions): Promise<Sandbox>;
        get(sessionId: string, opts: SessionGetOptions): Promise<AgentSandbox>;
        connect(sandboxId: string, opts?: ClientOptions): Promise<Sandbox>;
        list(opts?: SandboxListOptions): SandboxPaginator;
        list(opts: SessionListOptions): AsyncGenerator<AgentSandbox>;
        kill(sandboxId: string, opts?: ClientOptions): Promise<boolean>;
        pause(sandboxId: string, opts?: ClientOptions): Promise<SandboxInfo>;
    };

    readonly Template: {
        create(opts: TemplateCreateOptions): Promise<Template>;
        get(templateId: string, opts?: ClientOptions): Promise<Template>;
        list(opts?: TemplateListOptions): Pages<Template>;
        delete(templateId: string, opts?: ClientOptions): Promise<boolean>;
    };

    readonly Snapshot: {
        create(sandboxId: string, opts?: SnapshotCreateOptions & ClientOptions): Promise<Snapshot>;
        get(snapshotId: string, opts?: ClientOptions): Promise<Snapshot>;
        list(opts?: SnapshotListOptions): Pages<Snapshot>;
        delete(snapshotId: string, opts?: ClientOptions): Promise<boolean>;
    };

    constructor(opts: ClientOptions = {}) {
        this.Sandbox = {
            create: ((o?: SandboxCreateOptions | AgentSandboxCreateOptions) =>
                Sandbox.create({ ...opts, ...o } as never)) as SandboxClient["Sandbox"]["create"],
            getSession: (id, o) => Sandbox.getSession(id, { ...opts, ...o }),
            get: ((id: string, o?: SandboxGetOptions | SessionGetOptions) =>
                Sandbox.get(id, { ...opts, ...o } as never)) as SandboxClient["Sandbox"]["get"],
            connect: (id, o) => Sandbox.connect(id, { ...opts, ...o }),
            list: ((o?: SandboxListOptions | SessionListOptions) =>
                Sandbox.list({ ...opts, ...o } as never)) as SandboxClient["Sandbox"]["list"],
            kill: (id, o) => Sandbox.kill(id, { ...opts, ...o }),
            pause: (id, o) => Sandbox.pause(id, { ...opts, ...o }),
        };
        this.Template = {
            create: (o) => Template.create({ ...opts, ...o }),
            get: (id, o) => Template.get(id, { ...opts, ...o }),
            list: (o) => Template.list({ ...opts, ...o }),
            delete: (id, o) => Template.delete(id, { ...opts, ...o }),
        };
        this.Snapshot = {
            create: (id, o) => Snapshot.create(id, { ...opts, ...o }),
            get: (id, o) => Snapshot.get(id, { ...opts, ...o }),
            list: (o) => Snapshot.list({ ...opts, ...o }),
            delete: (id, o) => Snapshot.delete(id, { ...opts, ...o }),
        };
    }
}
