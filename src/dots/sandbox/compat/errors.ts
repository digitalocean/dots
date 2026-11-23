/**
 * Errors shared by the migration compat clients (`E2bClient`, `ModalClient`, `DaytonaClient`).
 */

import { SandboxError } from "../errors.js";

/**
 * The vendor API this member belongs to has no counterpart in DigitalOcean Sandboxes yet.
 * The signature exists so migrated code compiles. It is wired up when the API ships.
 */
export class NotImplementedError extends SandboxError {
    constructor(
        message: string,
        /** The vendor member, such as `Sandbox.pause`. */
        readonly member: string = "",
        /** The vendor platform, such as `E2B`. */
        readonly platform: string = "",
    ) {
        super(message, 501, "not_implemented");
    }
}

/** Builds the error for a vendor member that DigitalOcean Sandboxes cannot serve yet. */
export function notImplemented(platform: string, member: string, needs: string): NotImplementedError {
    return new NotImplementedError(`${platform}: ${member} is not implemented on DigitalOcean Sandboxes yet: needs ${needs}`, member, platform);
}
