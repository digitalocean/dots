/**
 * `Trigger`: the spec's front door for scheduled and webhook agent runs. It calls `Sandbox.trigger` (a fresh
 * session per run) or `box.trigger` (the session you pass as `sandbox`), so it has the same rules and errors.
 */

import type { TriggerHandle } from "../harnessRuntime/triggers.js";
import type { AgentSandbox } from "./agentSandbox.js";
import type { ClientOptions } from "./config.js";
import { SandboxError, UnsupportedError } from "./errors.js";
import { Sandbox, type Agent, type AgentOptions } from "./sandbox.js";
import type { CronSchedule, TriggerBase, WebhookSchedule, WebhookTriggerResult } from "./triggers.js";
import type { Manifest } from "../harnessRuntime/session.js";

/** What a trigger runs: a fresh agent each time, or the paused session you bind. */
export type TriggerRuns =
    | { agent: Agent | AgentOptions; manifest?: never; sandbox?: never; pause?: never }
    | { manifest: Manifest; agent?: never; sandbox?: never; pause?: never }
    | { sandbox: AgentSandbox; /** Pause the session first. */ pause?: boolean; agent?: never; manifest?: never };

export type TriggerCreateOptions = TriggerBase & ClientOptions & TriggerRuns;

export class Trigger {
    /**
     * Runs an agent on a schedule (`cron`, with an optional `timezone`) or when a webhook is called (`webhook`:
     * `"github"`, `"gitlab"` or `"custom"`). A webhook returns `{ trigger, setup }`; the secret in `setup` is shown once.
     */
    static async create(opts: TriggerCreateOptions & CronSchedule): Promise<TriggerHandle>;
    static async create(opts: TriggerCreateOptions & WebhookSchedule): Promise<WebhookTriggerResult>;
    static async create(opts: TriggerCreateOptions & (CronSchedule | WebhookSchedule)): Promise<TriggerHandle | WebhookTriggerResult> {
        const { sandbox, pause, ...rest } = opts as TriggerCreateOptions & { profile?: unknown; follow_latest?: unknown };
        const unsupported = ["profile", "followLatest"].find((k) => (rest as Record<string, unknown>)[k] !== undefined);
        if (unsupported) throw new UnsupportedError(`Trigger.create: \`${unsupported}\` is not supported yet: profiles are not built`);
        if (sandbox !== undefined) {
            if ((sandbox as { kind?: string }).kind !== "session") {
                throw new UnsupportedError("Trigger.create: a trigger can only bind an agent session. Create the sandbox with `agent`");
            }
            const { token, apiUrl, ...request } = rest as Record<string, unknown>;
            if (token !== undefined || apiUrl !== undefined) {
                throw new SandboxError("Trigger.create: a bound sandbox already has its connection; drop `token` and `apiUrl`");
            }
            return sandbox.trigger({ ...request, pause } as never);
        }
        return Sandbox.trigger(rest as never);
    }

    /**
     * A cron trigger: `Trigger.cron("0 9 * * 1-5", { tz: "America/Los_Angeles", agent, prompt, output })`. `tz` is the
     * time zone (the same as `timezone`). `name` defaults to a generated one, because the API needs a unique name.
     */
    static async cron(
        expression: string,
        opts: Omit<TriggerCreateOptions, "name"> & { name?: string; tz?: string; timezone?: string },
    ): Promise<TriggerHandle> {
        const { tz, timezone, name, ...rest } = opts;
        if (tz !== undefined && timezone !== undefined) throw new SandboxError("Trigger.cron: pass `tz` or `timezone`, not both");
        return Trigger.create({
            ...rest,
            name: name ?? `cron-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            cron: expression,
            timezone: timezone ?? tz,
        } as TriggerCreateOptions & CronSchedule);
    }
}
