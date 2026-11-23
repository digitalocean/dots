/**
 * Migration compat clients: E2B, Modal and Daytona code running on DigitalOcean Sandboxes.
 *
 * Import `@digitalocean/dots/sandbox/compat` for the three client classes, or a vendor subpath to swap
 * one import and keep the rest of the code:
 *
 * ```typescript
 * // was: import { Sandbox } from "e2b";
 * import { Sandbox } from "@digitalocean/dots/sandbox/compat/e2b";
 * ```
 *
 * The compat clients are for migration only. New code should use `SandboxClient` from
 * `@digitalocean/dots/sandbox`.
 */

export { E2bClient } from "./e2b/index.js";
export { ModalClient } from "./modal/index.js";
export { DaytonaClient } from "./daytona/index.js";
export { NotImplementedError } from "./errors.js";
