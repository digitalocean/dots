import { FetchRequestAdapter, KiotaClientFactory } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient, type DigitalOceanClient } from "../digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../DigitalOceanApiKeyAuthenticationProvider.js";
import { DEFAULT_BASE_URL, type HarnessStreamOptions } from "../streaming/harnessStream.js";
import { AuthenticationError, errorForStatus, SandboxError } from "./errors.js";

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

/**
 * fetch for the generated client, with one guard: every sandbox endpoint answers
 * JSON, so any other content type means something else replied (a gateway's
 * HTML 404 or 502 page, a proxy, a route that is not deployed). Kiota would
 * fail on that with "Content type text/html does not have a factory registered",
 * which hides the status. This raises the usual typed error with the status and
 * the start of the body instead.
 */
export async function guardedFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (response.status === 204 || type === "" || type.includes("json")) return response;
    const body = (await response.clone().text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);
    const where = `${init?.method ?? "GET"} ${typeof input === "string" ? input : input instanceof URL ? input.href : input.url}`;
    throw errorForStatus(
        response.status,
        `unexpected ${type.split(";")[0]} response (HTTP ${response.status}) from ${where}${body ? `: ${body}` : ""}`,
    );
}

/**
 * The generated client every JSON call goes through, plus what the streaming
 * calls (which Kiota cannot do) need to send the same authenticated request.
 */
export interface Connection {
    client: DigitalOceanClient;
    transport: Pick<HarnessStreamOptions, "authProvider" | "baseUrl">;
}

/** Resolves the token and builds the {@link Connection} the SDK sends every call through. */
export function connect(opts: ClientOptions = {}, env: NodeJS.ProcessEnv = process.env): Connection {
    const token = (opts.token ?? env.DIGITALOCEAN_ACCESS_TOKEN)?.trim();
    if (!token) {
        throw new AuthenticationError(
            "no API token: pass `token`, or set DIGITALOCEAN_ACCESS_TOKEN",
        );
    }
    const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
    const adapter = new FetchRequestAdapter(authProvider, undefined, undefined, KiotaClientFactory.create(guardedFetch));
    const baseUrl = (opts.apiUrl ?? env.DIGITALOCEAN_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    adapter.baseUrl = baseUrl;
    return { client: createDigitalOceanClient(adapter), transport: { authProvider, baseUrl } };
}
