import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { DigitalOceanApiKeyAuthenticationProvider } from "../DigitalOceanApiKeyAuthenticationProvider.js";
/**
 * Service types
 */
export var ServiceType;
(function (ServiceType) {
    ServiceType["DIGITALOCEAN_API"] = "digitalocean_api";
    ServiceType["SERVERLESS_INFERENCE"] = "serverless_inference";
    ServiceType["AGENT_INFERENCE"] = "agent_inference";
})(ServiceType || (ServiceType = {}));
/**
 * Bearer token authentication provider (for inference endpoints)
 */
class BearerTokenAuthenticationProvider {
    constructor(token) {
        this.token = token;
    }
    async authenticateRequest(request, _additionalAuthenticationContextProvider) {
        request.headers.add("Authorization", `Bearer ${this.token}`);
    }
}
/**
 * Create a DigitalOcean API v2 client
 * Default: https://api.digitalocean.com/v2
 */
export function createDigitalOceanClient(apiKey) {
    const config = {
        type: ServiceType.DIGITALOCEAN_API,
        baseUrl: "https://api.digitalocean.com",
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
export function createServerlessInferenceClient(authToken, baseUrl) {
    if (!authToken) {
        throw new Error("authToken is required for serverless inference");
    }
    const config = {
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
export function createAgentInferenceClient(agentUrl, authToken, customHeaders) {
    if (!agentUrl) {
        throw new Error("agentUrl is required for agent inference");
    }
    const normalizedUrl = agentUrl.startsWith("http")
        ? agentUrl
        : `https://${agentUrl}`;
    // Strip trailing /api/v1 — the Kiota URI templates already include path segments
    const baseUrl = normalizedUrl.replace(/\/api\/v1\/?$/, "");
    const config = {
        type: ServiceType.AGENT_INFERENCE,
        baseUrl: baseUrl,
        authToken: authToken,
        headers: customHeaders,
    };
    let authProvider;
    if (authToken) {
        authProvider = new BearerTokenAuthenticationProvider(authToken);
    }
    else {
        // Create a no-op auth provider if no token provided
        authProvider = new (class {
            async authenticateRequest(_request, _additionalAuthenticationContextProvider) {
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
    constructor() {
        this.services = new Map();
    }
    /**
     * Register a service
     */
    registerService(name, client) {
        this.services.set(name, client);
    }
    /**
     * Get a registered service
     */
    getService(name) {
        return this.services.get(name);
    }
    /**
     * Get all registered services
     */
    getAllServices() {
        return this.services;
    }
    /**
     * Remove a service
     */
    removeService(name) {
        return this.services.delete(name);
    }
    /**
     * List all service names
     */
    listServices() {
        return Array.from(this.services.keys());
    }
}
/**
 * Create a service manager with pre-configured services
 */
export function createServiceManager(configs) {
    const manager = new ServiceManager();
    if (configs.digitalOcean) {
        manager.registerService("digitalocean", createDigitalOceanClient(configs.digitalOcean));
    }
    if (configs.serverlessInference) {
        manager.registerService("serverless-inference", createServerlessInferenceClient(configs.serverlessInference.token, configs.serverlessInference.baseUrl));
    }
    if (configs.agentInference) {
        manager.registerService("agent-inference", createAgentInferenceClient(configs.agentInference.url, configs.agentInference.token, configs.agentInference.headers));
    }
    return manager;
}
