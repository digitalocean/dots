import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient, type DigitalOceanClient } from "../digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../DigitalOceanApiKeyAuthenticationProvider.js";
import { DEFAULT_BASE_URL } from "../streaming/harnessStream.js";
import { AuthenticationError, SandboxError } from "./errors.js";

/** Connection options, accepted by every static `Sandbox` method and by {@link SandboxClient}. */
export interface ClientOptions {
    /** A DigitalOcean API token. Defaults to `DIGITALOCEAN_ACCESS_TOKEN`. */
    token?: string;
    /** The API origin. Defaults to `DIGITALOCEAN_API_URL`, then https://api.digitalocean.com. */
    apiUrl?: string;
}

const CONNECTION_KEYS = new Set(["token", "apiUrl"]);

/** Throws on an option the SDK does not support, rather than dropping it silently. */
export function rejectUnknownOptions(opts: object, allowed: Iterable<string>, where: string): void {
    const ok = new Set([...allowed, ...CONNECTION_KEYS]);
    const bad = Object.keys(opts).filter((k) => !ok.has(k) && (opts as Record<string, unknown>)[k] !== undefined);
    if (bad.length) throw new SandboxError(`${where}: unsupported option${bad.length > 1 ? "s" : ""} ${bad.join(", ")}`);
}

/** Resolves the token and builds the generated client the SDK sends every call through. */
export function connect(opts: ClientOptions = {}, env: NodeJS.ProcessEnv = process.env): DigitalOceanClient {
    const token = (opts.token ?? env.DIGITALOCEAN_ACCESS_TOKEN)?.trim();
    if (!token) {
        throw new AuthenticationError(
            "no API token: pass `token`, or set DIGITALOCEAN_ACCESS_TOKEN",
        );
    }
    const adapter = new FetchRequestAdapter(new DigitalOceanApiKeyAuthenticationProvider(token));
    adapter.baseUrl = (opts.apiUrl ?? env.DIGITALOCEAN_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    return createDigitalOceanClient(adapter);
}
