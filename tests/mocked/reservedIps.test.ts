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

    it("should Mock the reserved IPs create operation.", async () => {
                const expected = {
					reserved_ip: {
						ip: "192.0.2.1",
						droplet: null,
						region: {
							name: "New York 3",
							slug: "nyc3",
							features: [
								"backups",
								"ipv6",
								"metadata",
								"install_agent",
								"storage",
								"image_transfer",
							],
							available: true,
							sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
						},
						locked: false,
					},
				};

                const typeExpected = {
					reservedIp: {
						ip: "192.0.2.1",
						droplet: {},
						region: {
							name: "New York 3",
							slug: "nyc3",
							features: [
								"backups",
								"ipv6",
								"metadata",
								"install_agent",
								"storage",
								"image_transfer",
							],
							available: true,
							sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
						},
						locked: false,
					},
				};
        const createReqNock={
					dropletId: 2457247,
				};
        const createReq = {
					"droplet_id": 2457247,
				};
        nock(baseUrl).post("/v2/reserved_ips", createReq).reply(201, expected);
        const resp = await client.v2.reserved_ips.post(createReqNock);
        expect(resp).toEqual(typeExpected);
    });

    it("Should Mock the reserved IPs delete operation.", async () => {
            nock(baseUrl).delete("/v2/reserved_ips/192.0.2.1").reply(204);
            const resp = await client.v2.reserved_ips.byReserved_ip("192.0.2.1").delete();
            expect(resp).toBeUndefined();
    });

    it("Should Mock the reserved IPs actions list operation", async () => {
        const expected = {
					actions: [
						{
							id: 1492489780,
							status: "completed",
							type: "unassign_ip",
							started_at: "2022-05-23T21:03:21Z",
							completed_at: "2022-05-23T21:03:22Z",
							resource_id: 2680918192,
							resource_type: "reserved_ip",
							region: {
								name: "New York 3",
								slug: "nyc3",
								features: [
									"backups",
									"ipv6",
									"metadata",
									"install_agent",
									"storage",
									"image_transfer",
								],
								available: true,
								sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
							},
							region_slug: "nyc3",
						},
						{
							id: 1453215653,
							status: "completed",
							type: "assign_ip",
							started_at: "2022-04-04T15:54:43Z",
							completed_at: "2022-04-04T15:54:46Z",
							resource_id: 2680918192,
							resource_type: "reserved_ip",
							region: {
								name: "New York 3",
								slug: "nyc3",
								features: [
									"backups",
									"ipv6",
									"metadata",
									"install_agent",
									"storage",
									"image_transfer",
								],
								available: true,
								sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
							},
							region_slug: "nyc3",
						},
						{
							id: 1453215650,
							status: "completed",
							type: "reserve_ip",
							started_at: "2022-04-04T15:54:43Z",
							completed_at: "2022-04-04T15:54:43Z",
							resource_id: 2680918192,
							resource_type: "reserved_ip",
							region: {
								name: "New York 3",
								slug: "nyc3",
								features: [
									"backups",
									"ipv6",
									"metadata",
									"install_agent",
									"storage",
									"image_transfer",
								],
								available: true,
								sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
							},
							region_slug: "nyc3",
						},
					],
					links: {},
					meta: { total: 3 },
				};
        
                const typeExpected = {
					actions: [
						{
							id: 1492489780,
							status: "completed",
							type: "unassign_ip",
							startedAt: new Date("2022-05-23T21:03:21Z"),
							completedAt: new Date("2022-05-23T21:03:22Z"),
							resourceId: 2680918192,
							resourceType: "reserved_ip",
							region: {
								name: "New York 3",
								slug: "nyc3",
								features: [
									"backups",
									"ipv6",
									"metadata",
									"install_agent",
									"storage",
									"image_transfer",
								],
								available: true,
								sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
							},
							regionSlug: "nyc3",
						},
						{
							id: 1453215653,
							status: "completed",
							type: "assign_ip",
							startedAt: new Date("2022-04-04T15:54:43Z"),
							completedAt: new Date("2022-04-04T15:54:46Z"),
							resourceId: 2680918192,
							resourceType: "reserved_ip",
							region: {
								name: "New York 3",
								slug: "nyc3",
								features: [
									"backups",
									"ipv6",
									"metadata",
									"install_agent",
									"storage",
									"image_transfer",
								],
								available: true,
								sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
							},
							regionSlug: "nyc3",
						},
						{
							id: 1453215650,
							status: "completed",
							type: "reserve_ip",
							startedAt: new Date("2022-04-04T15:54:43Z"),
							completedAt: new Date("2022-04-04T15:54:43Z"),
							resourceId: 2680918192,
							resourceType: "reserved_ip",
							region: {
								name: "New York 3",
								slug: "nyc3",
								features: [
									"backups",
									"ipv6",
									"metadata",
									"install_agent",
									"storage",
									"image_transfer",
								],
								available: true,
								sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
							},
							regionSlug: "nyc3",
						},
					],
					links: {},
					meta: { total: 3 },
				};
        
        nock(baseUrl).get("/v2/reserved_ips/192.0.2.1/actions").reply(200, expected);
        const resp = await client.v2.reserved_ips.byReserved_ip("192.0.2.1").actions.get();
        expect(resp).toEqual(typeExpected);
    });

    it("Should Mock the reserved IPs actions get operation", async () => {

        const expected = {
					action: {
						id: 1492489780,
						status: "completed",
						type: "unassign_ip",
						started_at: "2022-05-23T21:03:21Z",
						completed_at: "2022-05-23T21:03:22Z",
						resource_id: 2680918192,
						resource_type: "reserved_ip",
						region: {
							name: "New York 3",
							slug: "nyc3",
							features: [
								"backups",
								"ipv6",
								"metadata",
								"install_agent",
								"storage",
								"image_transfer",
							],
							available: true,
							sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
						},
						region_slug: "nyc3",
					},
				};

        const typeExpected = {
					action: {
						id: 1492489780,
						status: "completed",
						type: "unassign_ip",
						startedAt: new Date("2022-05-23T21:03:21Z"),
						completedAt: new Date("2022-05-23T21:03:22Z"),
						resourceId: 2680918192,
						resourceType: "reserved_ip",
						region: {
							name: "New York 3",
							slug: "nyc3",
							features: [
								"backups",
								"ipv6",
								"metadata",
								"install_agent",
								"storage",
								"image_transfer",
							],
							available: true,
							sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
						},
						regionSlug: "nyc3",
					},
				};

            nock(baseUrl).get("/v2/reserved_ips/192.0.2.1/actions/1492489780").reply(200, expected);
            const resp = await client.v2.reserved_ips.byReserved_ip("192.0.2.1").actions.byAction_id(1492489780).get();
            expect(resp).toEqual(typeExpected);
    });


    it("Should Mock the reserved IPs actions post operation..", async () => {

        const expected = {
					action: {
						id: 1492489780,
						status: "in-progress",
						type: "unassign_ip",
						started_at: "2022-05-23T21:03:21Z",
						completed_at: NaN,
						resource_id: 2680918192,
						resource_type: "reserved_ip",
						region: {
							name: "New York 3",
							slug: "nyc3",
							features: [
								"backups",
								"ipv6",
								"metadata",
								"install_agent",
								"storage",
								"image_transfer",
							],
							available: true,
							sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
						},
						region_slug: "nyc3",
					},
				};

        const typeExpected = {
					action: {
						id: 1492489780,
						status: "in-progress",
						type: "unassign_ip",
						startedAt: new Date("2022-05-23T21:03:21Z"),
						completedAt: undefined,
						resourceId: 2680918192,
						resourceType: "reserved_ip",
						region: {
							name: "New York 3",
							slug: "nyc3",
							features: [
								"backups",
								"ipv6",
								"metadata",
								"install_agent",
								"storage",
								"image_transfer",
							],
							available: true,
							sizes: ["s-1vcpu-1gb", "s-1vcpu-1gb-amd", "s-1vcpu-1gb-intel"],
						},
						regionSlug: "nyc3",
					},
				};

            nock(baseUrl).post("/v2/reserved_ips/192.0.2.1/actions", {"type": "unassign"}).reply(200, expected);

            const resp = await client.v2.reserved_ips.byReserved_ip("192.0.2.1").actions.post({"type": "unassign"});
            expect(resp).toEqual(typeExpected);
    });



});