import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const token = "mock-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);


describe("Integration Test for Actions Endpoint", () => {

    it("should list and get actions", async () => {
        // List actions
        const expected = {
					actions: [
						{
							id: 36804636,
							status: "completed",
							type: "create",
							started_at: "2020-11-14T16:29:21Z",
							completed_at: "2020-11-14T16:30:06Z",
							resource_id: 3164444,
							resource_type: "droplet",
							region: {
								name: "New York 3",
								slug: "nyc3",
								features: [
									"private_networking",
									"backups",
									"ipv6",
									"metadata",
									"install_agent",
									"storage",
									"image_transfer",
								],
								available: true,
								sizes: [
									"s-1vcpu-1gb",
									"s-1vcpu-2gb",
									"s-1vcpu-3gb",
									"s-2vcpu-2gb",
									"s-3vcpu-1gb",
									"s-2vcpu-4gb",
									"s-4vcpu-8gb",
									"s-6vcpu-16gb",
									"s-8vcpu-32gb",
									"s-12vcpu-48gb",
									"s-16vcpu-64gb",
									"s-20vcpu-96gb",
									"s-24vcpu-128gb",
									"s-32vcpu-192g",
								],
							},
							region_slug: "nyc3",
						},
					],
					links: {
						pages: {
							pages: {
								first: "https://api.digitalocean.com/v2/account/keys?page=1",
								prev: "https://api.digitalocean.com/v2/account/keys?page=2",
							},
						},
					},
					meta: {
						total: 1,
					},
				};
       nock("https://api.digitalocean.com")
            .get("/v2/actions")
            .reply(200,expected);
        
         nock("https://api.digitalocean.com")
            .get(`/v2/actions/${expected.actions[0].id}`)
            .reply(200, { action: expected.actions[0] });
    
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
    });
});