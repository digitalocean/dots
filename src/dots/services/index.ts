import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import {
    AuthenticationProvider,
    HttpMethod,
    RequestInformation,
} from "@microsoft/kiota-abstractions";
import { DigitalOceanApiKeyAuthenticationProvider } from "../DigitalOceanApiKeyAuthenticationProvider.js";

/**
 * Service types
 */
export enum ServiceType {
    DIGITALOCEAN_API = "digitalocean_api",
    SERVERLESS_INFERENCE = "serverless_inference",
    AGENT_INFERENCE = "agent_inference",
}

/**
 * Service configuration
 */
export interface ServiceConfig {
    type: ServiceType;
    baseUrl: string;
    apiKey?: string;
    authToken?: string;
    headers?: Record<string, string>;
}

/**
 * Service client
 */
export interface ServiceClient {
    adapter: FetchRequestAdapter;
    authProvider: AuthenticationProvider;
    baseUrl: string;
    config: ServiceConfig;
}

/**
 * Bearer token authentication provider (for inference endpoints)
 */
class BearerTokenAuthenticationProvider implements AuthenticationProvider {
    constructor(private token: string) {}

    async authenticateRequest(
        request: RequestInformation,
        _additionalAuthenticationContextProvider?: any
    ): Promise<void> {
        request.headers.add("Authorization", `Bearer ${this.token}`);
    }
}

/**
 * Create a DigitalOcean API v2 client
 * Default: https://api.digitalocean.com/v2
 */
export function createDigitalOceanClient(apiKey: string): ServiceClient {
    const config: ServiceConfig = {
        type: ServiceType.DIGITALOCEAN_API,
        baseUrl: "https://api.digitalocean.com/v2",
        apiKey: apiKey,
    };

    const authProvider = new DigitalOceanApiKeyAuthenticationProvider(apiKey);
    const adapter = new FetchRequestAdapter(authProvider);

    return {
        adapter,
        authProvider,
        baseUrl: config.baseUrl,
        config,
    };
}

/**
 * Create a serverless inference client
 * Default: https://inference.do-ai.run
 */
export function createServerlessInferenceClient(
    authToken: string,
    baseUrl?: string
): ServiceClient {
    if (!authToken) {
        throw new Error("authToken is required for serverless inference");
    }

    const config: ServiceConfig = {
        type: ServiceType.SERVERLESS_INFERENCE,
        baseUrl: baseUrl || "https://inference.do-ai.run",
        authToken: authToken,
    };

    const authProvider = new BearerTokenAuthenticationProvider(authToken);
    const adapter = new FetchRequestAdapter(authProvider);

    return {
        adapter,
        authProvider,
        baseUrl: config.baseUrl,
        config,
    };
}

/**
 * Create an agent inference client
 */
export function createAgentInferenceClient(
    agentUrl: string,
    authToken?: string,
    customHeaders?: Record<string, string>
): ServiceClient {
    if (!agentUrl) {
        throw new Error("agentUrl is required for agent inference");
    }

    // Ensure URL has proper format: https://{agent_url}/api/v1
    const normalizedUrl = agentUrl.startsWith("http")
        ? agentUrl
        : `https://${agentUrl}`;
    const baseUrl = normalizedUrl.endsWith("/api/v1")
        ? normalizedUrl
        : `${normalizedUrl}/api/v1`;

    const config: ServiceConfig = {
        type: ServiceType.AGENT_INFERENCE,
        baseUrl: baseUrl,
        authToken: authToken,
        headers: customHeaders,
    };

    let authProvider: AuthenticationProvider;

    if (authToken) {
        authProvider = new BearerTokenAuthenticationProvider(authToken);
    } else {
        // Create a no-op auth provider if no token provided
        authProvider = new (class implements AuthenticationProvider {
            async authenticateRequest(
                _request: RequestInformation,
                _additionalAuthenticationContextProvider?: any
            ): Promise<void> {
                // No authentication
            }
        })();
    }

    const adapter = new FetchRequestAdapter(authProvider);

    return {
        adapter,
        authProvider,
        baseUrl: config.baseUrl,
        config,
    };
}

/**
 * Multi-service client manager
 */
export class ServiceManager {
    private services: Map<string, ServiceClient> = new Map();

    /**
     * Register a service
     */
    registerService(name: string, client: ServiceClient): void {
        this.services.set(name, client);
    }

    /**
     * Get a registered service
     */
    getService(name: string): ServiceClient | undefined {
        return this.services.get(name);
    }

    /**
     * Get all registered services
     */
    getAllServices(): Map<string, ServiceClient> {
        return this.services;
    }

    /**
     * Remove a service
     */
    removeService(name: string): boolean {
        return this.services.delete(name);
    }

    /**
     * List all service names
     */
    listServices(): string[] {
        return Array.from(this.services.keys());
    }
}

/**
 * Create a service manager with pre-configured services
 */
export function createServiceManager(configs: {
    digitalOcean?: string;
    serverlessInference?: { token: string; baseUrl?: string };
    agentInference?: { url: string; token?: string; headers?: Record<string, string> };
}): ServiceManager {
    const manager = new ServiceManager();

    if (configs.digitalOcean) {
        manager.registerService(
            "digitalocean",
            createDigitalOceanClient(configs.digitalOcean)
        );
    }

    if (configs.serverlessInference) {
        manager.registerService(
            "serverless-inference",
            createServerlessInferenceClient(
                configs.serverlessInference.token,
                configs.serverlessInference.baseUrl
            )
        );
    }

    if (configs.agentInference) {
        manager.registerService(
            "agent-inference",
            createAgentInferenceClient(
                configs.agentInference.url,
                configs.agentInference.token,
                configs.agentInference.headers
            )
        );
    }

    return manager;
}
