/** The sandbox API calls a bare `Sandbox` and an `AgentSandbox` both make, keyed by sandbox id. */

import type { DigitalOceanClient } from "../digitalOceanClient.js";
import { call, NotFoundError, required, SandboxError } from "./errors.js";
import { toInfo, type SandboxInfo } from "./types.js";

export async function fetchInfo(client: DigitalOceanClient, sandboxId: string): Promise<SandboxInfo> {
    const res = await call(() => client.v2.sandboxes.bySandbox_id(requireId(sandboxId)).get());
    return toInfo(required(res, "the sandbox").sandbox);
}

export async function pauseSandbox(client: DigitalOceanClient, sandboxId: string): Promise<SandboxInfo> {
    const res = await call(() => client.v2.sandboxes.bySandbox_id(requireId(sandboxId)).pause.post());
    return toInfo(res?.sandbox);
}

export async function deleteSandbox(client: DigitalOceanClient, sandboxId: string): Promise<boolean> {
    try {
        await call(() => client.v2.sandboxes.bySandbox_id(requireId(sandboxId)).delete());
        return true;
    } catch (err) {
        if (err instanceof NotFoundError) return false;
        throw err;
    }
}

export function requireId(sandboxId: string): string {
    if (!sandboxId?.trim()) throw new SandboxError("`sandboxId` is required");
    return sandboxId;
}

export async function resumeSandbox(client: DigitalOceanClient, sandboxId: string): Promise<SandboxInfo> {
    const res = await call(() => client.v2.sandboxes.bySandbox_id(requireId(sandboxId)).resume.post());
    return toInfo(res?.sandbox);
}
