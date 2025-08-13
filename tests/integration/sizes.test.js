/**
 * Integration Test for Sizes
 */
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import dotenv from "dotenv";
dotenv.config();
const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Sizes API Integration Tests", () => {
    it("should list sizes", async () => {
        const listResp = await client.v2.sizes.get();
        expect(listResp && Array.isArray(listResp.sizes)).toBeTruthy();
        expect(listResp?.sizes?.length ?? 0).toBeGreaterThanOrEqual(20);
    });
    it("should list sizes asynchronously", async () => {
        const listResp = await client.v2.sizes.get();
        expect(listResp?.sizes?.length ?? 0).toBeGreaterThanOrEqual(20);
    });
});
