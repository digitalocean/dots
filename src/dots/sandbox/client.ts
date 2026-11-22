import type { ClientOptions } from "./config.js";
import {
    Sandbox,
    type SandboxCreateOptions,
    type SandboxListOptions,
    type SandboxPaginator,
} from "./sandbox.js";
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
        get(sandboxId: string, opts?: ClientOptions): Promise<Sandbox>;
        connect(sandboxId: string, opts?: ClientOptions): Promise<Sandbox>;
        list(opts?: SandboxListOptions): SandboxPaginator;
        kill(sandboxId: string, opts?: ClientOptions): Promise<boolean>;
        pause(sandboxId: string, opts?: ClientOptions): Promise<SandboxInfo>;
    };

    readonly Template: {
        create(opts: TemplateCreateOptions): Promise<Template>;
        get(templateId: string, opts?: ClientOptions): Promise<Template>;
        list(opts?: TemplateListOptions): Pages<Template>;
        delete(templateId: string, opts?: ClientOptions): Promise<boolean>;
    };

    constructor(opts: ClientOptions = {}) {
        this.Sandbox = {
            create: (o) => Sandbox.create({ ...opts, ...o }),
            get: (id, o) => Sandbox.get(id, { ...opts, ...o }),
            connect: (id, o) => Sandbox.connect(id, { ...opts, ...o }),
            list: (o) => Sandbox.list({ ...opts, ...o }),
            kill: (id, o) => Sandbox.kill(id, { ...opts, ...o }),
            pause: (id, o) => Sandbox.pause(id, { ...opts, ...o }),
        };
        this.Template = {
            create: (o) => Template.create({ ...opts, ...o }),
            get: (id, o) => Template.get(id, { ...opts, ...o }),
            list: (o) => Template.list({ ...opts, ...o }),
            delete: (id, o) => Template.delete(id, { ...opts, ...o }),
        };
    }
}
