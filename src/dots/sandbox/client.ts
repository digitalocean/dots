import type { ClientOptions } from "./config.js";
import {
    Sandbox,
    type SandboxCreateOptions,
    type SandboxListOptions,
    type SandboxPaginator,
} from "./sandbox.js";
import type { SandboxInfo } from "./types.js";

/**
 * Binds connection options once. Per-call options win.
 *
 * ```ts
 * const client = new SandboxClient({ token: process.env.DIGITALOCEAN_ACCESS_TOKEN });
 * const sandbox = await client.Sandbox.create({ template: "base" });
 * ```
 */
export class SandboxClient {
    readonly Sandbox: {
        create(opts: SandboxCreateOptions): Promise<Sandbox>;
        get(sandboxId: string, opts?: ClientOptions): Promise<Sandbox>;
        connect(sandboxId: string, opts?: ClientOptions): Promise<Sandbox>;
        list(opts?: SandboxListOptions): SandboxPaginator;
        kill(sandboxId: string, opts?: ClientOptions): Promise<boolean>;
        pause(sandboxId: string, opts?: ClientOptions): Promise<SandboxInfo>;
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
    }
}
