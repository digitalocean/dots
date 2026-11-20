import type { Sandbox_info as SandboxModel, Sandbox_state } from "../models/index.js";

/** The state of a sandbox. */
export type SandboxState = Sandbox_state;

/** A sandbox record as the API last returned it. */
export interface SandboxInfo {
    sandboxId: string;
    template: string;
    state: SandboxState;
    sizeSlug?: string;
    createdAt?: Date;
}

import { SandboxError } from "./errors.js";

export function toInfo(model: SandboxModel | null | undefined): SandboxInfo {
    if (!model?.sandboxId) throw new SandboxError("the API response did not include the sandbox");
    return {
        sandboxId: model.sandboxId,
        template: model.template ?? "",
        state: model.state ?? "SANDBOX_STATE_UNSPECIFIED",
        sizeSlug: model.sizeSlug ?? undefined,
        createdAt: model.createdAt ?? undefined,
    };
}
