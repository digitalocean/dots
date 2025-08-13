// cdn.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { Cdn_endpoint } from "../../src/dots/models/index.js";

const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

describe("CDN API", () => {
    afterEach(() => {
        nock.cleanAll();
    });

    it("should create a CDN endpoint", async () => {
        const createReq: Cdn_endpoint = {
            origin: "static-images.nyc3.digitaloceanspaces.com",
            ttl: 3600
        };

        const createReqNock = {
            origin: "static-images.nyc3.digitaloceanspaces.com",
            ttl: 3600
        };

        const expected = {
            endpoint: {
                id: "19f06b6a-3ace-4315-b086-499a0e521b76",
                origin: "static-images.nyc3.digitaloceanspaces.com",
                endpoint: "static-images.nyc3.cdn.digitaloceanspaces.com",
                created_at: "2018-07-19T15:04:16Z",
                ttl: 3600,
            }
        };

        const typeExpected = {
            endpoint: {
                id: "19f06b6a-3ace-4315-b086-499a0e521b76",
                origin: "static-images.nyc3.digitaloceanspaces.com",
                endpoint: "static-images.nyc3.cdn.digitaloceanspaces.com",
                createdAt: new Date("2018-07-19T15:04:16Z"),
                ttl: 3600,
            }
        };

        nock(baseUrl).post("/v2/cdn/endpoints", createReqNock).reply(201, expected);

        const resp = await client.v2.cdn.endpoints.post(createReq);
        expect(resp).toEqual(typeExpected);
    });

    it("should list CDN endpoints", async () => {
        const expected = {
            endpoints: [
                {
                    id: "19f06b6a-3ace-4315-b086-499a0e521b76",
                    origin: "static-images.nyc3.digitaloceanspaces.com",
                    endpoint: "static-images.nyc3.cdn.digitaloceanspaces.com",
                    created_at: "2018-07-19T15:04:16Z",
                    certificate_id: "892071a0-bb95-49bc-8021-3afd67a210bf",
                    custom_domain: "static.example.com",
                    ttl: 3600,
                }
            ],
            links: {},
            meta: { total: 1 }
        };

        const typeExpected = {
            endpoints: [
                {
                    id: "19f06b6a-3ace-4315-b086-499a0e521b76",
                    origin: "static-images.nyc3.digitaloceanspaces.com",
                    endpoint: "static-images.nyc3.cdn.digitaloceanspaces.com",
                    createdAt: new Date("2018-07-19T15:04:16Z"),
                    certificateId: "892071a0-bb95-49bc-8021-3afd67a210bf",
                    customDomain: "static.example.com",
                    ttl: 3600,
                }
            ],
            links: {},
            meta: { total: 1 }
        };

        nock(baseUrl).get("/v2/cdn/endpoints").reply(200, expected);

        const resp = await client.v2.cdn.endpoints.get();
        expect(resp).toEqual(typeExpected);
    });

    it("should get a CDN endpoint", async () => {
        const endpointId = "aa34ba1";
        const expected = {
            endpoint: {
                id: "19f06b6a-3ace-4315-b086-499a0e521b76",
                origin: "static-images.nyc3.digitaloceanspaces.com",
                endpoint: "static-images.nyc3.cdn.digitaloceanspaces.com",
                created_at: "2018-07-19T15:04:16Z",
                ttl: 3600,
            }
        };

        const typeExpected = {
            endpoint: {
                id: "19f06b6a-3ace-4315-b086-499a0e521b76",
                origin: "static-images.nyc3.digitaloceanspaces.com",
                endpoint: "static-images.nyc3.cdn.digitaloceanspaces.com",
                createdAt: new Date("2018-07-19T15:04:16Z"),
                ttl: 3600,
            }
        };

        nock(baseUrl).get(`/v2/cdn/endpoints/${endpointId}`).reply(200, expected);

        const resp = await client.v2.cdn.endpoints.byCdn_id(endpointId).get();
        expect(resp).toEqual(typeExpected);
    });

    it("should update a CDN endpoint", async () => {
        const endpointId = "aa34ba1";
        const updateReq={
            ttl: 3600,
        };
        const expected = {
            endpoint: {
                id: "19f06b6a-3ace-4315-b086-499a0e521b76",
                origin: "static-images.nyc3.digitaloceanspaces.com",
                endpoint: "static-images.nyc3.cdn.digitaloceanspaces.com",
                created_at: "2018-07-19T15:04:16Z",
                ttl: 3600,
            }
        };

        const typeExpected = {
            endpoint: {
                id: "19f06b6a-3ace-4315-b086-499a0e521b76",
                origin: "static-images.nyc3.digitaloceanspaces.com",
                endpoint: "static-images.nyc3.cdn.digitaloceanspaces.com",
                createdAt: new Date("2018-07-19T15:04:16Z"),
                ttl: 3600,
            }
        };

        nock(baseUrl).put(`/v2/cdn/endpoints/${endpointId}`, updateReq).reply(200, expected);

        const resp = await client.v2.cdn.endpoints.byCdn_id(endpointId).put(updateReq);
        expect(resp).toEqual(typeExpected);
    });

    it("should delete a CDN endpoint", async () => {
        const endpointId = "1";

        nock(baseUrl).delete(`/v2/cdn/endpoints/${endpointId}`).reply(204);

        const resp = await client.v2.cdn.endpoints.byCdn_id(endpointId).delete();
        expect(resp).toBeUndefined();
    });

    it("should purge CDN cache", async () => {
        const endpointId = "1";
        const purgeReq = {
            files: ["path/to/image.png", "path/to/css/*"]
        };

        const purgeReqNock = {
            files: ["path/to/image.png", "path/to/css/*"]
        };

        nock(baseUrl).delete(`/v2/cdn/endpoints/${endpointId}/cache`, purgeReqNock).reply(204);

        const resp = await client.v2.cdn.endpoints.byCdn_id(endpointId).cache.delete(purgeReq);
        expect(resp).toBeUndefined();
    });
});