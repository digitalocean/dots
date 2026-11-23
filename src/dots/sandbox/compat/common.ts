/**
 * Helpers shared by the migration compat clients.
 */

import { notImplemented } from "./errors.js";

/** Throws NotImplementedError for each option the caller passed explicitly that DigitalOcean Sandboxes cannot honor. */
export function rejectExplicit(platform: string, member: string, opts: object | undefined, needs: Readonly<Record<string, string>>): void {
    if (!opts) return;
    for (const [key, what] of Object.entries(needs)) {
        if ((opts as Record<string, unknown>)[key] !== undefined) {
            throw notImplemented(platform, `${member} option \`${key}\``, what);
        }
    }
}

/** vCPUs and memory of a DigitalOcean sandbox size slug such as `mars-2vcpu-4gb`. Zero when the slug is unknown. */
export function sizeSpec(slug: string | undefined): { vcpus: number; memoryMB: number } {
    const m = /(\d+)vcpu-(\d+)gb/.exec(slug ?? "");
    return m ? { vcpus: Number(m[1]), memoryMB: Number(m[2]) * 1024 } : { vcpus: 0, memoryMB: 0 };
}

/** Whole seconds for a millisecond timeout, at least 1. */
export function secondsFromMs(ms: number): number {
    return Math.max(1, Math.ceil(ms / 1000));
}

/** Lowercase short state: `running`, `paused`, or `creating`. */
export function shortState(state: string): "running" | "paused" | "creating" | "unknown" {
    switch (state) {
        case "SANDBOX_STATE_RUNNING":
            return "running";
        case "SANDBOX_STATE_PAUSED":
            return "paused";
        case "SANDBOX_STATE_CREATING":
            return "creating";
        default:
            return "unknown";
    }
}
