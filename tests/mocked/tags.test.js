/**
 * Mock tests for the Tags API
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
describe("Tags API Mock Tests", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should mock the tags list operation", async () => {
        const expected = {
            tags: [
                {
                    name: "tag-with-resources",
                    resources: {
                        count: 3,
                        last_tagged_uri: "https://api.digitalocean.com/v2/droplets/123",
                        droplets: {
                            count: 2,
                            last_tagged_uri: "https://api.digitalocean.com/v2/droplets/123",
                        },
                        images: {
                            count: 1,
                            last_tagged_uri: "https://api.digitalocean.com/v2/images/1234",
                        },
                        volumes: { count: 0 },
                        volume_snapshots: { count: 0 },
                        databases: { count: 0 },
                    },
                },
                {
                    name: "tag-with-no-resources",
                    resources: {
                        count: 0,
                        droplets: { count: 0 },
                        images: { count: 0 },
                        volumes: { count: 0 },
                        volume_snapshots: { count: 0 },
                        databases: { count: 0 },
                    },
                },
            ],
            links: {},
            meta: { total: 2 },
        };
        const typeExpected = {
            tags: [
                {
                    name: "tag-with-resources",
                    resources: {
                        count: 3,
                        lastTaggedUri: "https://api.digitalocean.com/v2/droplets/123",
                        droplets: {
                            count: 2,
                            lastTaggedUri: "https://api.digitalocean.com/v2/droplets/123",
                        },
                        additionalData: {
                            images: {
                                count: 1,
                                last_tagged_uri: "https://api.digitalocean.com/v2/images/1234",
                            },
                        },
                        volumes: { count: 0 },
                        volumeSnapshots: { count: 0 },
                        databases: { count: 0 },
                    },
                },
                {
                    name: "tag-with-no-resources",
                    resources: {
                        count: 0,
                        droplets: { count: 0 },
                        additionalData: {
                            images: { count: 0 },
                        },
                        volumes: { count: 0 },
                        volumeSnapshots: { count: 0 },
                        databases: { count: 0 },
                    },
                },
            ],
            links: {},
            meta: { total: 2 },
        };
        nock(baseUrl).get("/v2/tags").reply(200, expected);
        const tags = await client.v2.tags.get();
        expect(tags).toEqual(typeExpected);
    });
    it("should retrieve a tag by name", async () => {
        const expected = {
            tag: {
                name: "example-tag",
                resources: {
                    count: 1,
                    last_tagged_uri: "https://api.digitalocean.com/v2/images/1234",
                    droplets: { count: 0 },
                    images: {
                        count: 1,
                        last_tagged_uri: "https://api.digitalocean.com/v2/images/1234",
                    },
                    volumes: { count: 0 },
                    volume_snapshots: { count: 0 },
                    databases: { count: 0 },
                },
            },
        };
        const typeExpected = {
            tag: {
                name: "example-tag",
                resources: {
                    count: 1,
                    lastTaggedUri: "https://api.digitalocean.com/v2/images/1234",
                    droplets: { count: 0 },
                    additionalData: {
                        images: {
                            count: 1,
                            last_tagged_uri: "https://api.digitalocean.com/v2/images/1234",
                        },
                    },
                    volumes: { count: 0 },
                    volumeSnapshots: { count: 0 },
                    databases: { count: 0 },
                },
            },
        };
        nock(baseUrl).get("/v2/tags/example-tag").reply(200, expected);
        const tag = await client.v2.tags.byTag_id("example-tag").get();
        expect(tag).toEqual(typeExpected);
    });
    it("should create a tag", async () => {
        const expected = {
            tag: {
                name: "example-tag",
                resources: {
                    count: 0,
                    droplets: { count: 0 },
                    images: { count: 0 },
                    volumes: { count: 0 },
                    volume_snapshots: { count: 0 },
                    databases: { count: 0 },
                },
            },
        };
        const typeExpected = {
            tag: {
                name: "example-tag",
                resources: {
                    count: 0,
                    droplets: { count: 0 },
                    additionalData: {
                        images: { count: 0 },
                    },
                    volumes: { count: 0 },
                    volumeSnapshots: { count: 0 },
                    databases: { count: 0 },
                },
            },
        };
        nock(baseUrl).post("/v2/tags", { name: "example-tag" }).reply(201, expected);
        const tag = await client.v2.tags.post({ name: "example-tag" });
        expect(tag).toEqual(typeExpected);
    });
    it("should delete a tag", async () => {
        nock(baseUrl).delete("/v2/tags/example-tag").reply(204);
        const delResp = await client.v2.tags.byTag_id("example-tag").delete();
        expect(delResp).toBeUndefined();
    });
    it("should unassign resources from a tag", async () => {
        nock(baseUrl).delete("/v2/tags/example-tag/resources").reply(204);
        const req = {
            resources: [
                { resourceId: "1234", resourceType: "droplet" },
                { resourceId: "5678", resourceType: "image" },
                { resourceId: "aaa-bbb-ccc-111", resourceType: "volume" },
            ],
        };
        const unassignResp = await client.v2.tags.byTag_id("example-tag").resources.delete(req);
        expect(unassignResp).toBeUndefined();
    });
});
