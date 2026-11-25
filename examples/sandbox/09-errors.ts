/**
 * Errors: what the SDK throws, and how to catch it.
 *
 *   npx tsx examples/sandbox/09-errors.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see four cases, each with the class name, status, code and request id.
 * The wrong-token case passes its token to one call only; the environment is not changed.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import {
    AuthenticationError,
    InvalidRequestError,
    NotFoundError,
    Sandbox,
    SandboxError,
    Snapshot,
} from "../../src/dots/sandbox/index.js";

function show(label: string, err: unknown): void {
    if (err instanceof SandboxError) {
        console.log(`${label}\n  ${err.constructor.name}: ${err.message}`);
        console.log(`  status ${err.status}, code ${err.code ?? "none"}, requestId ${err.requestId ?? "none"}`);
    } else {
        throw err; // not an SDK error: a bug in your code, so do not hide it
    }
}

// 1. NotFoundError (404): no sandbox has this id.
try {
    await Sandbox.get("00000000-0000-0000-0000-000000000000");
} catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    show("1. get a sandbox that does not exist", err);
}

// 2. InvalidRequestError (400 or 422): the API rejects the values. An unknown size is one way.
try {
    await Sandbox.create({ size: "not-a-real-size" });
    console.log("2. the API accepted the size (unexpected)");
} catch (err) {
    if (!(err instanceof InvalidRequestError)) throw err;
    show("2. create with an invalid size", err);
}

// 3. A mistake the SDK catches before sending anything is a plain SandboxError (status 0).
//    The base class catches every error the SDK raises.
try {
    await Snapshot.create("any-id", { name: "Bad Name" });
} catch (err) {
    if (!(err instanceof SandboxError)) throw err;
    show("3. a bad snapshot name (checked before the request)", err);
}

// 4. AuthenticationError (401): a wrong token. Passed to this call only.
try {
    await Sandbox.get("00000000-0000-0000-0000-000000000000", { token: "not-a-real-token" });
} catch (err) {
    if (!(err instanceof AuthenticationError)) throw err;
    show("4. a wrong token", err);
}
