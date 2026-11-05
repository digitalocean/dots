/**
 * Webhook and cron triggers: an agent run started by an external event or a
 * schedule. Everything here calls the trigger API as it is today.
 *
 * Known limits of that API, which this SDK documents rather than works around:
 * there is no way to fire a trigger on demand, execution status is read by
 * polling, and a cron tick skipped because the previous run was still active
 * leaves no record.
 */

import {
    Trigger_kindObject,
    Trigger_output_modeObject,
    Trigger_session_modeObject,
    Trigger_statusObject,
    type Create_trigger_request,
    type Trigger,
    type Trigger_execution,
    type Trigger_output_write,
    type Webhook_provider,
} from "../models/index.js";
import { call, required } from "./errors.js";
import { manifestText, paginate, type Manifest, type RuntimeContext, type Session } from "./session.js";

/** Where a run's result is delivered when it finishes. */
export type TriggerOutput = { slack: string } | { email: string };

/** What each run starts from. */
export type TriggerTarget =
    /** A fresh session per run, created from this manifest. */
    | { manifest: Manifest }
    /** The same paused session, resumed for each run. */
    | { session: Session | string };

/** Fields both trigger kinds share. */
export type TriggerInput = TriggerTarget & {
    /** Team-unique name. */
    name: string;
    /** The prompt sent on each run. */
    prompt: string;
    /** Deliver each run's result to Slack (an incoming webhook URL) or email. */
    output?: TriggerOutput;
};

/** One run of a trigger. */
export interface TriggerExecution {
    id: string;
    status: "pending" | "running" | "succeeded" | "failed";
    /** The run's session, once it exists. */
    sessionId?: string;
    runId?: string;
    /** A fixed, client-safe reason when the run failed. */
    failureReason?: string;
    /** The run's transcript. Only `TriggerHandle.execution(id)` returns it. */
    output?: string;
    /** True when `output` is incomplete. */
    truncated: boolean;
    createdAt?: Date;
    raw: Trigger_execution;
}

/** Setup steps for a webhook trigger, from the provider list. */
export interface WebhookSetup {
    /** The URL the external system posts to. */
    url: string;
    /** The signing secret. The API returns it only once, at creation. */
    secret: string;
    /** The provider's name, such as GitHub. */
    provider: string;
    /** Where the secret goes in the external system. */
    pasteHint?: string;
    /** The header the external system signs with. */
    signatureHeader?: string;
    docsUrl?: string;
    /** The above as readable text, ready to print. */
    text: string;
}

/** Creates, finds and lists triggers. */
export class Triggers {
    constructor(private readonly ctx: RuntimeContext) {}

    /**
     * Creates a webhook trigger. The result carries the setup steps, including
     * the signing secret, which the API returns only this once.
     */
    async webhook(
        input: TriggerInput & { provider: "github" | "gitlab" | "custom" },
    ): Promise<{ trigger: TriggerHandle; setup: WebhookSetup }> {
        const res = await call(() =>
            this.ctx.client.v2.agents.triggers.post({
                ...this.common(input),
                kind: Trigger_kindObject.Webhook,
                webhook: { provider: input.provider },
            }),
        );
        const trigger = new TriggerHandle(this.ctx, required(res?.trigger, "the trigger"));
        const url = required(trigger.info.webhook?.webhookUrl, "the webhook URL");
        const secret = required(res?.webhookSecret, "the webhook secret");
        const provider = await this.provider(input.provider);
        return { trigger, setup: webhookSetup(url, secret, input.provider, provider) };
    }

    /** Creates a cron trigger. `schedule` is a cron expression, read in `timezone`. */
    async cron(input: TriggerInput & { schedule: string; timezone: string }): Promise<TriggerHandle> {
        const res = await call(() =>
            this.ctx.client.v2.agents.triggers.post({
                ...this.common(input),
                kind: Trigger_kindObject.Cron,
                cron: { cronExpr: input.schedule, timezone: input.timezone },
            }),
        );
        return new TriggerHandle(this.ctx, required(res?.trigger, "the trigger"));
    }

    async get(id: string): Promise<TriggerHandle> {
        const res = await call(() => this.ctx.client.v2.agents.triggers.byTrigger_id(id).get());
        return new TriggerHandle(this.ctx, required(res?.trigger, "the trigger"));
    }

    list(options: { kind?: "webhook" | "cron"; status?: "active" | "paused" } = {}): AsyncGenerator<TriggerHandle> {
        return paginate(async (pageToken) => {
            const res = await call(() =>
                this.ctx.client.v2.agents.triggers.get({
                    queryParameters: { pageToken, kind: options.kind as never, status: options.status as never },
                }),
            );
            return {
                items: (res?.triggers ?? []).map((t) => new TriggerHandle(this.ctx, t)),
                nextPageToken: res?.nextPageToken,
            };
        });
    }

    private common(input: TriggerInput): Omit<Create_trigger_request, "kind"> {
        const base = { name: input.name, promptTemplate: input.prompt, output: outputWrite(input.output) };
        if ("manifest" in input) {
            return {
                ...base,
                sessionMode: Trigger_session_modeObject.Fresh,
                sessionTemplate: manifestText(input.manifest),
            };
        }
        return {
            ...base,
            sessionMode: Trigger_session_modeObject.Reuse,
            boundSessionId: typeof input.session === "string" ? input.session : input.session.id,
        };
    }

    /**
     * Best effort: the trigger already exists and its secret is only returned
     * once, so a failure here must not lose it. Without the provider details the
     * setup text simply omits the paste hint.
     */
    private async provider(key: string): Promise<Webhook_provider | undefined> {
        try {
            const res = await this.ctx.client.v2.agents.webhookProviders.get();
            return res?.providers?.find((p) => p.key === key);
        } catch {
            return undefined;
        }
    }
}

/** A trigger. */
export class TriggerHandle {
    constructor(
        private readonly ctx: RuntimeContext,
        /** The trigger record as last read from the API. */
        public info: Trigger,
    ) {}

    get id(): string {
        return required(this.info.triggerId, "the trigger id");
    }

    get name(): string {
        return this.info.name ?? "";
    }

    /** For a cron trigger, the next scheduled run. */
    get nextRunAt(): Date | undefined {
        return this.info.cron?.nextRunAt ?? undefined;
    }

    private get item() {
        return this.ctx.client.v2.agents.triggers.byTrigger_id(this.id);
    }

    /** The trigger's runs, newest first. Polling this is how runs are watched. */
    executions(options: { status?: TriggerExecution["status"] } = {}): AsyncGenerator<TriggerExecution> {
        return paginate(async (pageToken) => {
            const res = await call(() =>
                this.item.executions.get({ queryParameters: { pageToken, status: options.status as never } }),
            );
            return { items: (res?.executions ?? []).map(toExecution), nextPageToken: res?.nextPageToken };
        });
    }

    /** One run, with its transcript. */
    async execution(id: string): Promise<TriggerExecution> {
        const res = await call(() => this.item.executions.byExecution_id(id).get());
        return toExecution(required(res?.execution, "the execution"));
    }

    async cancelExecution(id: string): Promise<void> {
        await call(() => this.item.executions.byExecution_id(id).cancel.post());
    }

    async pause(): Promise<void> {
        await this.update({ status: Trigger_statusObject.Paused });
    }

    async resume(): Promise<void> {
        await this.update({ status: Trigger_statusObject.Active });
    }

    /** Issues a new webhook signing secret and returns it. It is shown only once. */
    async rotateSecret(): Promise<string> {
        const res = await call(() => this.item.rotateSecret.post());
        return required(res?.webhookSecret, "the webhook secret");
    }

    async delete(): Promise<void> {
        await call(() => this.item.delete());
    }

    private async update(patch: { status: Trigger["status"] }): Promise<void> {
        const res = await call(() => this.item.patch(patch));
        this.info = required(res?.trigger, "the trigger");
    }
}

function outputWrite(output: TriggerOutput | undefined): Trigger_output_write {
    if (!output) return { mode: Trigger_output_modeObject.None };
    if ("slack" in output) return { mode: Trigger_output_modeObject.Slack, slack: { webhookUrl: output.slack } };
    return { mode: Trigger_output_modeObject.Email, email: output.email };
}

function toExecution(raw: Trigger_execution): TriggerExecution {
    return {
        id: required(raw.executionId, "the execution id"),
        status: (raw.status ?? "pending") as TriggerExecution["status"],
        sessionId: raw.sessionId || undefined,
        runId: raw.runId || undefined,
        failureReason: raw.failureReason || undefined,
        output: raw.outputText ?? undefined,
        truncated: raw.outputTruncated ?? false,
        createdAt: raw.createdAt ?? undefined,
        raw,
    };
}

function webhookSetup(url: string, secret: string, key: string, provider?: Webhook_provider): WebhookSetup {
    const name = provider?.displayName || key;
    const setup = {
        url,
        secret,
        provider: name,
        pasteHint: provider?.pasteHint || undefined,
        signatureHeader: provider?.signature?.header || undefined,
        docsUrl: provider?.docsUrl || undefined,
    };
    const lines = [
        `Configure a ${name} webhook:`,
        `  Payload URL: ${url}`,
        `  Secret:      ${secret}   (shown only now; rotate it if lost)`,
    ];
    if (setup.pasteHint) lines.push(`  ${setup.pasteHint}`);
    if (setup.signatureHeader) lines.push(`  ${name} signs each delivery in the ${setup.signatureHeader} header.`);
    if (setup.docsUrl) lines.push(`  Docs: ${setup.docsUrl}`);
    return { ...setup, text: lines.join("\n") };
}
