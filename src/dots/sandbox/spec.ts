/**
 * The helpers the Agent Sandbox spec names: `Permissions`, `Bash`, `Secret`, `Email`, `Slack`, `Image`, the `egress`
 * forms, and the streamed `execStream` result. They shape what `Sandbox.create` takes. The ones that need a backend
 * that does not exist yet throw {@link UnsupportedError} (also exported as `NotSupportedError`) before any request.
 */

import type { TriggerOutput } from "../harnessRuntime/triggers.js";
import type { ClientOptions } from "./config.js";
import { SandboxError, UnsupportedError } from "./errors.js";
import { Pages } from "./pages.js";
import { Template, type TemplateWaitOptions } from "./templates.js";

// --- permissions ------------------------------------------------------------------------------------------------

/** One tool rule: a tool name such as `"file.read"`, or a tool with a pattern, such as `Bash("git *")`. */
export type ToolRule = string | { tool: string; match?: Record<string, string> };

/** A rule for the `bash` tool that matches the command against a glob: `Bash("git *")`. */
export function Bash(pattern: string): ToolRule {
    if (typeof pattern !== "string" || !pattern.trim()) throw new SandboxError("Bash: the pattern must not be empty");
    return { tool: "bash", match: { command: pattern } };
}

export type PermissionAction = "allow" | "ask" | "deny";

export interface PermissionsOptions {
    /** What a call that matches no rule gets. The platform defaults to `"ask"`. */
    default?: PermissionAction;
    allow?: ToolRule[];
    ask?: ToolRule[];
    deny?: ToolRule[];
}

/**
 * What an agent may do: a default, and rules that allow, ask or deny a tool. The platform takes the last matching
 * rule, so the rules go out as allow, then ask, then deny: a deny always beats an allow.
 *
 * ```ts
 * new Permissions({ default: "ask", allow: [Bash("git *"), "file.read"], deny: [Bash("rm -rf *")] })
 * ```
 */
export class Permissions {
    constructor(readonly options: PermissionsOptions = {}) {
        const d = options.default;
        if (d !== undefined && !["allow", "ask", "deny"].includes(d)) {
            throw new SandboxError('Permissions: `default` must be "allow", "ask" or "deny"');
        }
        for (const k of Object.keys(options)) {
            if (!["default", "allow", "ask", "deny"].includes(k)) throw new SandboxError(`Permissions: unsupported option ${k}`);
        }
    }

    /** The manifest `permissions` block. */
    toManifest(): Record<string, unknown> {
        const rules: Record<string, unknown>[] = [];
        for (const action of ["allow", "ask", "deny"] as const) {
            for (const rule of this.options[action] ?? []) {
                const r = typeof rule === "string" ? { tool: rule } : rule;
                if (!r.tool?.trim()) throw new SandboxError(`Permissions: a ${action} rule needs a tool name`);
                rules.push({ ...r, action });
            }
        }
        return { ...(this.options.default ? { default: this.options.default } : {}), ...(rules.length ? { rules } : {}) };
    }
}

/** @internal `Permissions` or a manifest-shaped object, as the manifest block. */
export function permissionsToManifest(p: Permissions | Record<string, unknown>): Record<string, unknown> {
    return p instanceof Permissions ? p.toManifest() : p;
}

// --- secrets and egress ------------------------------------------------------------------------------------------

/**
 * A credential. A plain `Secret(value)` is the same as passing the string: it becomes an environment variable in
 * the sandbox. `hosts` or `url` would bind it to destinations so the agent never sees it, which this SDK cannot
 * send yet: those throw {@link UnsupportedError}.
 */
export class Secret {
    constructor(
        readonly value: string,
        readonly options: { hosts?: string[]; url?: string } = {},
    ) {
        if (typeof value !== "string" || !value) throw new SandboxError("Secret: the value must not be empty");
    }
}

/** @internal Secrets as plain name/value pairs. A host-bound secret is refused. */
export function secretsToEnv(secrets: Record<string, string | Secret>, where: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, s] of Object.entries(secrets)) {
        if (s instanceof Secret) {
            if (s.options.hosts?.length || s.options.url) {
                throw new UnsupportedError(`${where}: a secret bound to hosts (\`${name}\`) is not supported by this SDK yet; pass its value as a plain secret`);
            }
            out[name] = s.value;
        } else if (typeof s === "string") {
            out[name] = s;
        } else {
            throw new SandboxError(`${where}: secret \`${name}\` must be a string or a Secret`);
        }
    }
    return out;
}

/**
 * Where the sandbox may connect. A host list allows only those hosts (an empty list blocks everything), `"none"`
 * blocks everything, `"unrestricted"` blocks nothing, and the object form takes hosts and exact IP addresses.
 */
export type Egress =
    | string[]
    | "none"
    | "unrestricted"
    | { allowHosts?: string[]; allowIps?: string[]; /** The same as `allowHosts`. */ allow?: string[] };

/** @internal The manifest `egress` value. */
export function egressToManifest(e: Egress, where: string): unknown {
    if (Array.isArray(e)) return checkHosts(e, where);
    if (e === "none" || e === "unrestricted") return e;
    if (e && typeof e === "object") {
        if (e.allow !== undefined && e.allowHosts !== undefined) throw new SandboxError(`${where}: egress takes \`allow\` or \`allowHosts\`, not both`);
        const hosts = e.allowHosts ?? e.allow;
        if (hosts === undefined && e.allowIps === undefined) throw new SandboxError(`${where}: egress needs \`allowHosts\` or \`allowIps\``);
        return {
            ...(hosts !== undefined ? { allow_hosts: checkHosts(hosts, where) } : {}),
            ...(e.allowIps !== undefined ? { allow_ips: checkHosts(e.allowIps, where) } : {}),
        };
    }
    throw new SandboxError(`${where}: egress must be a host list, "none", "unrestricted" or { allowHosts, allowIps }`);
}

/** @internal A bare sandbox only has all-or-nothing egress. Resolves `allowInternetAccess`. */
export function egressToInternetAccess(e: Egress, where: string): boolean {
    if (e === "none" || (Array.isArray(e) && e.length === 0)) return false;
    if (e === "unrestricted") return true;
    throw new UnsupportedError(
        `${where}: a bare sandbox supports egress "none", "unrestricted" or an empty list only, because the sandbox API has no host allowlist. ` +
            "Create it with an agent for host allowlists.",
    );
}

function checkHosts(list: unknown[], where: string): string[] {
    for (const h of list) if (typeof h !== "string" || !h.trim()) throw new SandboxError(`${where}: egress hosts must be non-empty strings`);
    return list as string[];
}

// --- trigger outputs ---------------------------------------------------------------------------------------------

/** Deliver a trigger's result by email: `output: Email("me@example.com")`. */
export function Email(address: string): TriggerOutput {
    if (!address?.trim()) throw new SandboxError("Email: the address must not be empty");
    return { email: address };
}

/** Deliver a trigger's result to Slack through an incoming webhook URL: `output: Slack(url)`. */
export function Slack(webhookUrl: string): TriggerOutput {
    if (!webhookUrl?.trim()) throw new SandboxError("Slack: the webhook URL must not be empty");
    return { slack: webhookUrl };
}

// --- images ------------------------------------------------------------------------------------------------------

type ImageSourceKind = "environment" | "named" | "registry" | "ubuntu" | "dockerfile";
const ENVIRONMENTS = ["coding", "interpreter", "browser", "app-builder", "desktop"];

/**
 * What a sandbox boots from. `Image.coding()` is the default ready-made environment, `Image.fromRegistry(ref)` a
 * registry image you can `build(name)` into a named template, and a name is `Sandbox.create({ image: "acme/tools" })`.
 *
 * Only those two work today. The builder calls (`aptInstall`, `pipInstall`, `run`, `withHarness`) and the
 * `ubuntu`, `fromDockerfile` and other ready-made sources describe an image that nothing can build yet: they are
 * accepted so the code reads the same, and creating or building with them throws {@link UnsupportedError}.
 */
export class Image {
    private constructor(
        readonly kind: ImageSourceKind,
        /** The environment, template name, registry reference, Ubuntu version or Dockerfile path. */
        readonly ref: string,
        /** The builder steps, in order, such as `apt-install ffmpeg`. */
        readonly steps: readonly string[] = [],
    ) {}

    /** The default environment, with the coding toolchain. */
    static coding(): Image {
        return new Image("environment", "coding");
    }
    static interpreter(): Image {
        return new Image("environment", "interpreter");
    }
    static browser(): Image {
        return new Image("environment", "browser");
    }
    static appBuilder(): Image {
        return new Image("environment", "app-builder");
    }
    static desktop(): Image {
        return new Image("environment", "desktop");
    }
    static fromEnvironment(name: string): Image {
        if (!ENVIRONMENTS.includes(name)) throw new SandboxError(`Image.fromEnvironment: unknown environment "${name}" (${ENVIRONMENTS.join(", ")})`);
        return new Image("environment", name);
    }
    static ubuntu(version: string): Image {
        return new Image("ubuntu", version);
    }
    /** An OCI image in a public registry or DigitalOcean Container Registry. Pin the digest. */
    static fromRegistry(ref: string): Image {
        if (!ref?.trim()) throw new SandboxError("Image.fromRegistry: the reference must not be empty");
        return new Image("registry", ref);
    }
    static fromDockerfile(path: string): Image {
        return new Image("dockerfile", path);
    }
    /** An image you already saved under a name. The same as passing the name string. */
    static named(name: string): Image {
        if (!name?.trim()) throw new SandboxError("Image.named: the name must not be empty");
        return new Image("named", name);
    }

    aptInstall(...packages: string[]): Image {
        return this.step("apt-install", packages);
    }
    pipInstall(...packages: string[]): Image {
        return this.step("pip-install", packages);
    }
    run(command: string): Image {
        return this.step("run", [command]);
    }
    withHarness(harness: string): Image {
        return this.step("with-harness", [harness]);
    }

    private step(name: string, args: string[]): Image {
        if (!args.length || args.some((a) => !a?.trim())) throw new SandboxError(`Image.${name}: pass at least one non-empty argument`);
        return new Image(this.kind, this.ref, [...this.steps, `${name} ${args.join(" ")}`]);
    }

    /** @internal The template name to create from. `undefined` means the default (coding) template. */
    resolve(where: string): string | undefined {
        if (this.steps.length) {
            throw new UnsupportedError(`${where}: an image with builder steps (${this.steps[0]}) needs the image builder, which is not built yet`);
        }
        switch (this.kind) {
            case "named":
                return this.ref;
            case "environment":
                if (this.ref === "coding") return undefined;
                throw new UnsupportedError(`${where}: the "${this.ref}" environment does not exist yet. Only "coding" does`);
            case "registry":
                throw new UnsupportedError(`${where}: a registry image has to be built first: \`await image.build("name")\`, then pass the name as \`image\``);
            default:
                throw new UnsupportedError(`${where}: Image.${this.kind === "ubuntu" ? "ubuntu" : "fromDockerfile"} needs the image builder, which is not built yet`);
        }
    }

    /**
     * Saves a registry image as a named template and waits for the build. Throws {@link BuildError} if it fails.
     * Only `Image.fromRegistry(ref)` with no builder steps can build today.
     */
    async build(name: string, opts: ClientOptions & { baseTemplate?: string } & TemplateWaitOptions = {}): Promise<Template> {
        if (this.kind !== "registry" || this.steps.length) {
            throw new UnsupportedError("Image.build: only Image.fromRegistry(ref) with no builder steps can build today");
        }
        const { baseTemplate, timeoutMs, pollIntervalMs, ...client } = opts;
        const template = await Template.create({ ...client, name, sourceOciRef: this.ref, baseTemplate });
        return template.waitUntilReady({ timeoutMs, pollIntervalMs });
    }

    /** The team's saved images (templates). */
    static list(opts: Parameters<typeof Template.list>[0] = {}): Pages<Template> {
        return Template.list(opts);
    }
}

// --- streamed exec -----------------------------------------------------------------------------------------------

/** One piece of output from a streamed command. */
export interface StreamChunk {
    stream: "stdout" | "stderr";
    text: string;
}

/**
 * The output of a command as it arrives: `for await (const chunk of box.execStream("npm ci")) ...`. After the loop
 * `result` holds the same result `exec` returns. `await stream.wait()` gives it without iterating.
 */
export class ExecStream<R extends { exitCode: number; ok: boolean }> implements AsyncIterable<StreamChunk> {
    /** The command's result, set once it has exited. */
    result?: R;
    private readonly queue: StreamChunk[] = [];
    private wake?: () => void;
    private finished = false;
    private failure?: { error: unknown };
    private readonly done: Promise<R>;

    /** @internal */
    constructor(start: (on: { onStdout: (t: string) => void; onStderr: (t: string) => void }) => Promise<R>) {
        const push = (stream: "stdout" | "stderr") => (text: string) => {
            this.queue.push({ stream, text });
            this.wake?.();
        };
        this.done = start({ onStdout: push("stdout"), onStderr: push("stderr") }).then(
            (r) => {
                this.result = r;
                this.finish();
                return r;
            },
            (error) => {
                this.failure = { error };
                this.finish();
                throw error;
            },
        );
        this.done.catch(() => undefined); // wait() or the loop reports it
    }

    private finish(): void {
        this.finished = true;
        this.wake?.();
    }

    /** Resolves the result when the command exits, or rejects with its failure. */
    wait(): Promise<R> {
        return this.done;
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
        for (;;) {
            const next = this.queue.shift();
            if (next) {
                yield next;
                continue;
            }
            if (this.finished) break;
            await new Promise<void>((r) => (this.wake = r));
            this.wake = undefined;
        }
        if (this.failure) throw this.failure.error;
    }
}

// --- create options ---------------------------------------------------------------------------------------------

/**
 * The create options the spec names that no API takes yet. Passing one throws {@link UnsupportedError} before any
 * request, so a call never quietly ignores a setting.
 */
const NOT_BUILT: Record<string, string> = {
    cpu: "custom sizes are not built (use `size`)",
    memoryGb: "custom sizes are not built (use `size`)",
    timeout: "a maximum lifetime is not built",
    idleTimeout: "an idle timeout cannot be set at create",
    onIdle: "an idle action cannot be set at create",
    metadata: "metadata is not built",
    labels: "labels are not built",
    workspace: "workspaces are not built into Sandbox.create",
    profile: "profiles are not built",
    signals: "Signals are not built",
    mounts: "bucket mounts are not built",
    gpu: "GPU sandboxes are not built",
    managed: "there is no managed flag: pass `agent` to run a managed agent",
};

/** @internal Throws for any create option the spec names that nothing can honor yet. */
export function refuseNotBuilt(opts: object, where: string, allow: string[] = []): void {
    for (const [key, why] of Object.entries(NOT_BUILT)) {
        if (!allow.includes(key) && (opts as Record<string, unknown>)[key] !== undefined) {
            throw new UnsupportedError(`${where}: \`${key}\` is not supported yet: ${why}`);
        }
    }
}

/** @internal `image` (a name or an {@link Image}) or `environment` as a template name. `undefined` means the default template. */
export function resolveImage(image: string | Image | undefined, environment: string | undefined, where: string): string | undefined {
    if (image !== undefined && environment !== undefined) throw new SandboxError(`${where}: pass \`image\` or \`environment\`, not both`);
    if (environment !== undefined) return Image.fromEnvironment(environment).resolve(where);
    if (image === undefined) return undefined;
    if (image instanceof Image) return image.resolve(where);
    if (typeof image !== "string" || !image.trim()) throw new SandboxError(`${where}: \`image\` must be an Image or a non-empty name`);
    return image;
}
