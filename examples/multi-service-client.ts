import {
    ServiceManager,
    createServiceManager,
    createDigitalOceanClient,
    createServerlessInferenceClient,
    createAgentInferenceClient,
    ServiceType,
} from "../src/dots/services/index.js";

/**
 * Example 1: Using individual service clients
 */
async function exampleIndividualServices() {
    console.log("=== Example 1: Individual Service Clients ===\n");

    // DigitalOcean API v2
    const doClient = createDigitalOceanClient(process.env.DO_API_KEY!);
    console.log("DigitalOcean Client:");
    console.log(`  Base URL: ${doClient.baseUrl}`);
    console.log(`  Service Type: ${doClient.config.type}\n`);

    // Serverless Inference
    const serverlessClient = createServerlessInferenceClient(
        process.env.INFERENCE_TOKEN!,
        "https://inference.do-ai.run" // custom base URL (optional)
    );
    console.log("Serverless Inference Client:");
    console.log(`  Base URL: ${serverlessClient.baseUrl}`);
    console.log(`  Service Type: ${serverlessClient.config.type}\n`);

    // Agent Inference
    const agentClient = createAgentInferenceClient(
        "my-agent.example.com", // Agent URL
        process.env.AGENT_TOKEN, // Optional auth token
        { "X-Custom-Header": "value" } // Optional custom headers
    );
    console.log("Agent Inference Client:");
    console.log(`  Base URL: ${agentClient.baseUrl}`);
    console.log(`  Service Type: ${agentClient.config.type}\n`);
}

/**
 * Example 2: Using ServiceManager with pre-configured services
 */
async function exampleServiceManager() {
    console.log("=== Example 2: Service Manager ===\n");

    const manager = createServiceManager({
        digitalOcean: process.env.DO_API_KEY,
        serverlessInference: {
            token: process.env.INFERENCE_TOKEN!,
            baseUrl: "https://inference.do-ai.run",
        },
        agentInference: {
            url: "my-agent.example.com",
            token: process.env.AGENT_TOKEN,
            headers: { "X-Custom-Header": "value" },
        },
    });

    console.log("Registered services:");
    manager.listServices().forEach((name) => {
        const service = manager.getService(name);
        if (service) {
            console.log(`  - ${name}: ${service.config.type} (${service.baseUrl})`);
        }
    });
    console.log();

    // Get a specific service
    const doService = manager.getService("digitalocean");
    if (doService) {
        console.log(`Retrieved service: ${doService.config.type}`);
        console.log(`  Adapter: ${doService.adapter.constructor.name}`);
        console.log(`  Base URL: ${doService.baseUrl}\n`);
    }
}

/**
 * Example 3: Dynamic service registration
 */
async function exampleDynamicRegistration() {
    console.log("=== Example 3: Dynamic Service Registration ===\n");

    const manager = new ServiceManager();

    // Register services dynamically
    manager.registerService(
        "do-prod",
        createDigitalOceanClient(process.env.DO_API_KEY!)
    );

    manager.registerService(
        "inference-prod",
        createServerlessInferenceClient(process.env.INFERENCE_TOKEN!)
    );

    manager.registerService(
        "agent-dev",
        createAgentInferenceClient("dev-agent.internal.com")
    );

    manager.registerService(
        "agent-prod",
        createAgentInferenceClient(
            "prod-agent.internal.com",
            process.env.AGENT_TOKEN
        )
    );

    console.log("Dynamically registered services:");
    manager.listServices().forEach((name) => {
        const service = manager.getService(name);
        if (service) {
            console.log(`  ${name}:`);
            console.log(`    Type: ${service.config.type}`);
            console.log(`    URL: ${service.baseUrl}`);
            console.log(`    Has Auth Token: ${!!service.config.authToken}`);
        }
    });
    console.log();

    // Remove a service
    manager.removeService("agent-dev");
    console.log("After removing 'agent-dev':");
    console.log(`  Services: ${manager.listServices().join(", ")}\n`);
}

/**
 * Example 4: Using different service URLs for environment-specific configuration
 */
async function exampleEnvironmentSpecific() {
    console.log("=== Example 4: Environment-Specific Configuration ===\n");

    const environment = process.env.NODE_ENV || "development";

    const config =
        environment === "production"
            ? {
                  digitalOcean: process.env.DO_API_KEY_PROD,
                  serverlessInference: {
                      token: process.env.INFERENCE_TOKEN_PROD!,
                      baseUrl: "https://inference.prod.do-ai.run",
                  },
                  agentInference: {
                      url: "prod-agent.company.com",
                      token: process.env.AGENT_TOKEN_PROD,
                  },
              }
            : {
                  digitalOcean: process.env.DO_API_KEY_DEV,
                  serverlessInference: {
                      token: process.env.INFERENCE_TOKEN_DEV!,
                      baseUrl: "https://inference.dev.do-ai.run",
                  },
                  agentInference: {
                      url: "dev-agent.company.com",
                      token: process.env.AGENT_TOKEN_DEV,
                  },
              };

    const manager = createServiceManager(config);

    console.log(`Environment: ${environment}`);
    console.log(`Services configured for ${environment}:`);
    manager.listServices().forEach((name) => {
        const service = manager.getService(name);
        if (service) {
            // Mask sensitive URLs
            const displayUrl = service.baseUrl.includes("local")
                ? service.baseUrl
                : new URL(service.baseUrl).hostname;
            console.log(`  - ${name}: ${displayUrl}`);
        }
    });
    console.log();
}

/**
 * Main runner
 */
async function main() {
    try {
        // Check required environment variables
        if (!process.env.DO_API_KEY) {
            console.warn("Warning: DO_API_KEY not set\n");
        }

        // Run examples
        await exampleIndividualServices();
        await exampleServiceManager();
        await exampleDynamicRegistration();
        await exampleEnvironmentSpecific();

        console.log("✅ All examples completed successfully!");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main();
