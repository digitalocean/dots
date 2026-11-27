/**
 * Custom sandbox templates: `/v2/sandboxes/templates`.
 *
 * A template is built by rebasing a customer OCI image onto a base template.
 * The build is asynchronous: create, wait until it is ready, then pass the
 * template's name to `Sandbox.create`.
 *
 * ```ts
 * const template = await Template.create({
 *     name: "my-template",
 *     sourceOciRef: "registry.digitalocean.com/my-team/my-image:v1",
 * });
 * await template.waitUntilReady();
 * const sandbox = await Sandbox.create({ template: template.name });
 * ```
 */

import type {
    Image_source,
    Template as TemplateModel,
    Template_build as BuildModel,
    Template_build_status,
    Template_spec,
    Template_status,
} from "../models/index.js";
import { connect, rejectUnknownOptions, type ClientOptions, type Connection } from "./config.js";
import { Pages } from "./pages.js";
import { DEFAULT_TEMPLATE } from "./sandbox.js";
import { BuildError, call, NotFoundError, required, SandboxError, SandboxTimeoutError } from "./errors.js";

export { Pages };

/** The state of a template. */
export type TemplateStatus = Template_status;
/** The state of one template build. */
export type TemplateBuildStatus = Template_build_status;

/** A customer OCI image. */
export interface ImageSource {
    registry?: string;
    repository?: string;
    tag?: string;
    digest?: string;
}

/** A template record as the API last returned it. */
export interface TemplateInfo {
    templateId: string;
    name: string;
    status: TemplateStatus;
    /** The base template the image was rebased onto. */
    baseTemplate?: string;
    image?: ImageSource;
    createdAt?: Date;
    updatedAt?: Date;
}

/** One build of a template. */
export interface TemplateBuildInfo {
    buildId: string;
    templateId: string;
    name?: string;
    status: TemplateBuildStatus;
    /** Set when the build failed. */
    error?: string;
    baseTemplate?: string;
    image?: ImageSource;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface TemplateCreateOptions extends ClientOptions {
    /** Template name. Required. It must not collide with a global base template name. */
    name: string;
    /** The OCI image: `registry/repository:tag` or `registry/repository@digest`. Required. */
    sourceOciRef: string;
    /** The base template to rebase the image onto. Defaults to `coding-base`. */
    baseTemplate?: string;
}

export interface TemplateUpdateOptions {
    /** The new OCI image. */
    sourceOciRef?: string;
    /** The new base template. */
    baseTemplate?: string;
}

export interface TemplateListOptions extends ClientOptions {
    /** Page size. */
    limit?: number;
    /** Resume after the `nextToken` of an earlier page. */
    nextToken?: string;
}

export interface TemplateWaitOptions {
    /** Defaults to 10 minutes. */
    timeoutMs?: number;
    /** Defaults to 2 s. */
    pollIntervalMs?: number;
}

const CREATE_KEYS = ["name", "sourceOciRef", "baseTemplate"];
const LIST_KEYS = ["limit", "nextToken"];

function toImage(m: Image_source | null | undefined): ImageSource | undefined {
    if (!m) return undefined;
    return {
        registry: m.registry ?? undefined,
        repository: m.repository ?? undefined,
        tag: m.tag ?? undefined,
        digest: m.digest ?? undefined,
    };
}

function specParts(spec: Template_spec | null | undefined) {
    return { baseTemplate: spec?.baseTemplate ?? undefined, image: toImage(spec?.image) };
}

export function toTemplateInfo(m: TemplateModel | null | undefined): TemplateInfo {
    if (!m?.templateId) throw new SandboxError("the API response did not include the template");
    return {
        templateId: m.templateId,
        name: m.name ?? "",
        status: m.status ?? "TEMPLATE_STATUS_UNSPECIFIED",
        ...specParts(m.spec),
        createdAt: m.createdAt ?? undefined,
        updatedAt: m.updatedAt ?? undefined,
    };
}

export function toBuildInfo(m: BuildModel | null | undefined): TemplateBuildInfo {
    if (!m?.buildId) throw new SandboxError("the API response did not include the build");
    return {
        buildId: m.buildId,
        templateId: m.templateId ?? "",
        name: m.name ?? undefined,
        status: m.status ?? "TEMPLATE_BUILD_STATUS_UNSPECIFIED",
        error: m.errorEscaped || undefined,
        ...specParts(m.spec),
        createdAt: m.createdAt ?? undefined,
        updatedAt: m.updatedAt ?? undefined,
    };
}

export class Template {
    /** The record as last returned by the API. Call {@link refresh} to update it. */
    info: TemplateInfo;

    private constructor(
        private readonly conn: Connection,
        info: TemplateInfo,
    ) {
        this.info = info;
    }

    get templateId(): string {
        return this.info.templateId;
    }
    /** The name `Sandbox.create({ template })` takes. */
    get name(): string {
        return this.info.name;
    }
    get status(): TemplateStatus {
        return this.info.status;
    }

    /** Builds a custom template. Resolves as soon as the build starts: call {@link waitUntilReady}. */
    static async create(opts: TemplateCreateOptions): Promise<Template> {
        rejectUnknownOptions(opts ?? {}, CREATE_KEYS, "Template.create");
        if (!opts?.name?.trim()) throw new SandboxError("Template.create: `name` is required");
        if (!opts.sourceOciRef?.trim()) throw new SandboxError("Template.create: `sourceOciRef` is required");
        const conn = connect(opts);
        const res = await call(() =>
            conn.client.v2.sandboxes.templates.post({
                name: opts.name,
                baseTemplate: opts.baseTemplate || DEFAULT_TEMPLATE,
                sourceOciRef: opts.sourceOciRef,
            }),
        );
        return new Template(conn, toTemplateInfo(res?.template));
    }

    /** Fetches a template by id. */
    static async get(templateId: string, opts: ClientOptions = {}): Promise<Template> {
        const conn = connect(opts);
        return new Template(conn, await fetchTemplate(conn, templateId));
    }

    /** Lists your team's custom templates. Global base templates are not included. */
    static list(opts: TemplateListOptions = {}): Pages<Template> {
        rejectUnknownOptions(opts, LIST_KEYS, "Template.list");
        const conn = connect(opts);
        return new Pages<Template>(async (token) => {
            const res = await call(() =>
                conn.client.v2.sandboxes.templates.get({ queryParameters: { pageSize: opts.limit, pageToken: token } }),
            );
            return {
                items: (res?.templates ?? []).map((m) => new Template(conn, toTemplateInfo(m))),
                next: res?.nextPageToken,
            };
        }, opts.nextToken);
    }

    /** Deletes a template by id. Resolves `false` when it does not exist. */
    static async delete(templateId: string, opts: ClientOptions = {}): Promise<boolean> {
        return deleteTemplate(connect(opts), templateId);
    }

    /** Reads the template again. */
    async refresh(): Promise<TemplateInfo> {
        this.info = await fetchTemplate(this.conn, this.templateId);
        return this.info;
    }

    /** Changes the base template and/or image and starts a new build: call {@link waitUntilReady}. */
    async update(opts: TemplateUpdateOptions): Promise<TemplateInfo> {
        rejectUnknownOptions(opts ?? {}, ["sourceOciRef", "baseTemplate"], "template.update");
        if (!opts?.sourceOciRef?.trim() && !opts?.baseTemplate?.trim()) {
            throw new SandboxError("template.update: pass `sourceOciRef` and/or `baseTemplate`");
        }
        const res = await call(() =>
            this.item.put({ baseTemplate: opts.baseTemplate || undefined, sourceOciRef: opts.sourceOciRef || undefined }),
        );
        this.info = toTemplateInfo(res?.template);
        return this.info;
    }

    /** Deletes the template. Resolves `false` when it is already gone. */
    async delete(): Promise<boolean> {
        return deleteTemplate(this.conn, this.templateId);
    }

    /** Lists the template's builds. */
    builds(opts: { limit?: number } = {}): Pages<TemplateBuildInfo> {
        return new Pages<TemplateBuildInfo>(async (token) => {
            const res = await call(() =>
                this.item.builds.get({ queryParameters: { pageSize: opts.limit, pageToken: token } }),
            );
            return { items: (res?.builds ?? []).map(toBuildInfo), next: res?.nextPageToken };
        });
    }

    /** Fetches one build of the template. */
    async build(buildId: string): Promise<TemplateBuildInfo> {
        if (!buildId?.trim()) throw new SandboxError("`buildId` is required");
        const res = await call(() => this.item.builds.byBuild_id(buildId).get());
        return toBuildInfo(required(res, "the build").build);
    }

    /**
     * Polls until the template is ready. Raises if the build failed (with the
     * newest failed build's error, when the API gives one) or the wait runs out.
     */
    async waitUntilReady(opts: TemplateWaitOptions = {}): Promise<this> {
        const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
        for (;;) {
            if (this.status === "TEMPLATE_STATUS_READY") return this;
            if (this.status === "TEMPLATE_STATUS_FAILED") throw await this.failure();
            if (Date.now() >= deadline) {
                throw new SandboxTimeoutError(
                    `template ${this.templateId} was not ready in time (last status ${this.status})`,
                );
            }
            await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 2_000));
            await this.refresh();
        }
    }

    private get item() {
        return this.conn.client.v2.sandboxes.templates.byTemplate_id(this.templateId);
    }

    private async failure(): Promise<SandboxError> {
        const message = `template ${this.templateId} failed to build`;
        try {
            const page = await this.builds().nextItems();
            const failed = page
                .filter((b) => b.status === "TEMPLATE_BUILD_STATUS_FAILED" && b.error)
                .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0];
            if (failed) return new BuildError(`${message}: ${failed.error}`, failed.error);
        } catch {
            /* the build list is a nicety; report the failure without it */
        }
        return new BuildError(message);
    }
}

async function fetchTemplate(conn: Connection, templateId: string): Promise<TemplateInfo> {
    if (!templateId?.trim()) throw new SandboxError("`templateId` is required");
    const res = await call(() => conn.client.v2.sandboxes.templates.byTemplate_id(templateId).get());
    return toTemplateInfo(required(res, "the template").template);
}

async function deleteTemplate(conn: Connection, templateId: string): Promise<boolean> {
    if (!templateId?.trim()) throw new SandboxError("`templateId` is required");
    try {
        await call(() => conn.client.v2.sandboxes.templates.byTemplate_id(templateId).delete());
        return true;
    } catch (err) {
        if (err instanceof NotFoundError) return false;
        throw err;
    }
}
