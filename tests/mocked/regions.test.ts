// cdn.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";

const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

describe("CDN API", () => {
    afterEach(() => {
        nock.cleanAll();
    });

    it("should Mock the regions list operation", async () => {
        const expected = {
					regions: [
						{
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
					],
					links: {
						pages: {
							last: "https://api.digitalocean.com/v2/regions?page=13&per_page=1",
							next: "https://api.digitalocean.com/v2/regions?page=2&per_page=1",
						},
					},
					meta: { total: 1 },
				};
        const typeExpected = {
					regions: [
						{
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
					],
					links: {
						pages: {
                            additionalData: {
							last: "https://api.digitalocean.com/v2/regions?page=13&per_page=1",
							next: "https://api.digitalocean.com/v2/regions?page=2&per_page=1",
                            }
						},
					},
					meta: { total: 1 },
				};

                nock(baseUrl).get("/v2/regions")
                            .reply(200, expected);
                const resp = await client.v2.regions.get();
                expect(resp).toStrictEqual(typeExpected);
    });

});