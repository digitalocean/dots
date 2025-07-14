/*
actions.test.ts
*/
import nock from "nock";


import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";



const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);


describe('Actions API Resource', () => {
    afterEach(() => {
        nock.cleanAll();
    });

  it('should mock the actions list operation', async () => {
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
					first: "https://api.digitalocean.com/v2/account/keys?page=1",
					prev: "https://api.digitalocean.com/v2/account/keys?page=2",
				},
			},
			meta: {
				total: 1,
			},
		};
    const typeExpected = {
			actions: [
				{
					id: 36804636,
					status: "completed",
					type: "create",
					startedAt: new Date("2020-11-14T16:29:21Z"),
					completedAt: new Date("2020-11-14T16:30:06Z"),
					resourceId: 3164444,
					resourceType: "droplet",
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
					regionSlug: "nyc3",
				},
			],
			links: {
				pages: {
					first: "https://api.digitalocean.com/v2/account/keys?page=1",
					prev: "https://api.digitalocean.com/v2/account/keys?page=2",
				},
			},
			meta: {
				total: 1,
			},
		};

    nock(baseUrl)
      .get('/v2/actions')
      .reply(200, expected);

    const listResp = await client.v2.actions.get();

    expect(listResp).toEqual(typeExpected);
  });

  it('should mock the actions get operation', async () => {
    const actionId = 36804636;
    const expected = {
        action: {
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
    };

    const typeExpected = {
        action: {
            id: 36804636,
            status: "completed",
            type: "create",
            startedAt: new Date("2020-11-14T16:29:21Z"),
            completedAt: new Date("2020-11-14T16:30:06Z"),
            resourceId: 3164444,
            resourceType: "droplet",
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
            regionSlug: "nyc3",
        },
    };
    nock(baseUrl)
      .get(`/v2/actions/${actionId}`)
      .reply(200, expected);

    const getResp = await client.v2.actions.byAction_id(actionId).get();

    expect(getResp).toEqual(typeExpected);
  });
});