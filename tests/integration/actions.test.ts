import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import dotenv from "dotenv";
dotenv.config();
const token =  process.env.DIGITALOCEAN_TOKEN;
if (!token) {
	throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

describe("Integration Test for Actions Endpoint", () => {

    it("should list and get actions", async () => {
        const listResp = await client.v2.actions.get();
        expect(listResp).not.toBeNull();
        expect(listResp?.actions).toBeDefined();
        expect(listResp?.actions?.length).toBeGreaterThan(0);

        const actionId = listResp?.actions?.[0]?.id || 0;
        expect(actionId).not.toBe(0);

        const getResp = await client.v2.actions.byAction_id(actionId).get();
        expect(getResp).not.toBeNull();
        expect(getResp?.action).toBeDefined();
        expect(getResp?.action?.id).toBe(actionId);
    }, 50000);
});
