import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();
const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}
const PREFIX = "test-dots";
const REGION = "nyc3";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Container Registry Integration Tests", () => {
    it("should test container registry lifecycle", async () => {
        const expectedName = `${PREFIX}-${uuidv4()}`;
        const containerRegistryReq = {
            name: expectedName,
            subscriptionTierSlug: "professional",
            region: REGION,
        };
        try {
            const getSubResp = await client.v2.registry.subscription.get();
            if (!getSubResp || !getSubResp.subscription) {
                throw new Error("Failed to get subscription");
            }
            expect(getSubResp.subscription.tier?.slug).toBe("professional");
            const containerRegistryResp = await client.v2.registries.post(containerRegistryReq);
            if (!containerRegistryResp || !containerRegistryResp.registry) {
                throw new Error("Failed to create container registry");
            }
            expect(containerRegistryResp.registry.name).toBe(expectedName);
            const registryName = containerRegistryResp.registry.name;
            const getDockerResp = await client.v2.registry.dockerCredentials.get({
                queryParameters: { readWrite: true }
            });
            if (!getDockerResp || !getDockerResp.auths) {
                throw new Error("Failed to get docker credentials");
            }
            expect(getDockerResp.auths["registryDigitaloceanCom"]?.auth).toBeDefined();
            const getResp = await client.v2.registries.byRegistry_name(expectedName).get();
            if (!getResp || !getResp.registry) {
                throw new Error("Failed to get registry");
            }
            expect(getResp.registry.name).toBe(expectedName);
            const newName = `${PREFIX}-${uuidv4()}`;
            const validateNameResp = await client.v2.registry.validateName.post({
                name: newName
            });
            expect(validateNameResp).toBeUndefined();
            const payLoad = {
                type: "unreferenced blobs only",
            };
            const garbageResp = await client.v2.registry.byRegistry_name(registryName).garbageCollection.post(payLoad);
            if (!garbageResp || !garbageResp.garbageCollection) {
                throw new Error("Failed to start garbage collection");
            }
            expect(garbageResp.garbageCollection.status).toBe("requested");
            const garbageActiveResp = await client.v2.registry.byRegistry_name(registryName).garbageCollection.get();
            if (!garbageActiveResp || !garbageActiveResp.garbageCollection) {
                throw new Error("Failed to get active garbage collection");
            }
            expect(garbageActiveResp.garbageCollection.registryName).toBe(registryName);
            const garbageListResp = await client.v2.registry.byRegistry_name(registryName).garbageCollections.get();
            if (!garbageListResp || !garbageListResp.garbageCollections) {
                throw new Error("Failed to list garbage collections");
            }
            expect(garbageListResp.garbageCollections.length).toBeGreaterThan(0);
            const registryOptionsResp = await client.v2.registry.optionsPath.get();
            if (!registryOptionsResp || !registryOptionsResp.options) {
                throw new Error("Failed to get registry options");
            }
            expect(registryOptionsResp.options.availableRegions?.length).toBeGreaterThan(0);
        }
        catch (error) {
            console.error("Failed to cleanup registry:", error);
        }
    }, 120000);
});
