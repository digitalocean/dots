/**
 * Triggers for agent sessions: run an agent on a schedule (cron) or from a webhook.
 *
 * Two entry points share this file's checks and call the Harness Runtime triggers API:
 * - `box.trigger(...)` binds the trigger to that session (reuse mode: the same session, resumed for each run).
 * - `Sandbox.trigger(...)` starts a fresh session per run, from an `Agent` or a manifest.
 */

import type { TriggerHandle, TriggerOutput, WebhookSetup } from "../harnessRuntime/triggers.js";
import type { Connection } from "./config.js";
import { SandboxError, viaHarness } from "./errors.js";

/** What every trigger needs. */
export interface TriggerBase {
    /** Team-unique name. */
    name: string;
    /** The prompt sent on each run. */
    prompt: string;
    /** Deliver each run's result to Slack (an incoming webhook URL) or email. */
    output?: TriggerOutput;
}

/** Run on a schedule. Returns a {@link TriggerHandle}. */
export interface CronSchedule {
    /** A cron expression, read in `timezone`, such as `"0 9 * * 1-5"`. */
    cron: string;
    /** An IANA time zone. Defaults to `"UTC"`. */
    timezone?: string;
    webhook?: never;
}

/** Run when an external system posts to the trigger's URL. Returns the handle and the setup steps. */
export interface WebhookSchedule {
    /** The sender, which decides how requests are verified. */
    webhook: "github" | "gitlab" | "custom";
    cron?: never;
    timezone?: never;
}

/** What a webhook trigger returns: the handle, and the setup steps, including the signing secret (shown only once). */
export interface WebhookTriggerResult {
    trigger: TriggerHandle;
    setup: WebhookSetup;
}

/** The sandbox-agnostic part of a trigger call, as it reaches {@link createTrigger}. */
export type TriggerRequest = TriggerBase & (CronSchedule | WebhookSchedule);

const REQUEST_KEYS = ["name", "prompt", "output", "cron", "timezone", "webhook"];

/** Checks a trigger request before anything is sent. `extra` are the keys the caller adds (such as `agent`). */
export function checkTriggerRequest(opts: object, extra: string[], where: string): void {
    const allowed = new Set([...REQUEST_KEYS, ...extra]);
    const bad = Object.keys(opts).filter((k) => !allowed.has(k) && (opts as Record<string, unknown>)[k] !== undefined);
    if (bad.length) throw new SandboxError(`${where}: unsupported option${bad.length > 1 ? "s" : ""} ${bad.join(", ")}`);
    const o = opts as Partial<TriggerBase & { cron: string; webhook: string }>;
    if (!o.name?.trim()) throw new SandboxError(`${where}: \`name\` is required`);
    if (!o.prompt?.trim()) throw new SandboxError(`${where}: \`prompt\` is required`);
    if ((o.cron === undefined) === (o.webhook === undefined)) {
        throw new SandboxError(`${where}: pass \`cron\` (a schedule) or \`webhook\` (github, gitlab or custom), not both or neither`);
    }
    if (o.cron !== undefined && !String(o.cron).trim()) throw new SandboxError(`${where}: \`cron\` must not be empty`);
    if (o.webhook !== undefined && !["github", "gitlab", "custom"].includes(o.webhook)) {
        throw new SandboxError(`${where}: \`webhook\` must be "github", "gitlab" or "custom"`);
    }
}

/** @internal Creates the trigger through the harness API. The target is a fresh-session manifest or a bound session. */
export async function createTrigger(
    conn: Connection,
    target: { manifest: Record<string, unknown> | string } | { session: string },
    req: TriggerRequest,
): Promise<TriggerHandle | WebhookTriggerResult> {
    const common = { ...target, name: req.name, prompt: req.prompt, output: req.output };
    const triggers = conn.harness().triggers;
    if (req.webhook !== undefined) return viaHarness(() => triggers.webhook({ ...common, provider: req.webhook! }));
    return viaHarness(() => triggers.cron({ ...common, schedule: req.cron!, timezone: req.timezone ?? "UTC" }));
}
