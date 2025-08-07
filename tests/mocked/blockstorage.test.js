// droplets.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Block Storage API", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should list block storage volumes", async () => {
        const expected = {
            volumes: [
                {
                    id: "506f78a4-e098-11e5-ad9f-000f53306ae1",
                    region: {
                        name: "New York 1",
                        slug: "nyc1",
                        sizes: ["s-1vcpu-1gb", "s-1vcpu-2gb"],
                        features: ["private_networking", "backups"],
                        available: true,
                    },
                    droplet_ids: [],
                    name: "example",
                    description: "Block store for examples",
                    size_gigabytes: 10,
                    created_at: "2016-03-02T17:00:49Z",
                    filesystem_type: "ext4",
                    filesystem_label: "example",
                    tags: ["aninterestingtag"],
                },
            ],
            links: {},
            meta: { total: 1 },
        };
        const typeExpected = {
            volumes: [
                {
                    id: "506f78a4-e098-11e5-ad9f-000f53306ae1",
                    region: {
                        name: "New York 1",
                        slug: "nyc1",
                        sizes: ["s-1vcpu-1gb", "s-1vcpu-2gb"],
                        features: ["private_networking", "backups"],
                        available: true,
                    },
                    dropletIds: [],
                    name: "example",
                    description: "Block store for examples",
                    sizeGigabytes: 10,
                    createdAt: "2016-03-02T17:00:49Z",
                    filesystemType: "ext4",
                    filesystemLabel: "example",
                    tags: ["aninterestingtag"],
                },
            ],
            links: {},
            meta: { total: 1 },
        };
        nock(baseUrl).get("/v2/volumes").reply(200, expected);
        const resp = await client.v2.volumes.get();
        expect(resp).toEqual(typeExpected);
    });
    it("should create a block storage volume", async () => {
        const volumeReq = {
            sizeGigabytes: 10,
            name: `test-volume`,
            description: `Block store for sample`,
            region: `nyc3`,
            filesystemType: `ext4`,
            filesystemLabel: `ext4_volume_01`
        };
        const volumeReqNock = {
            size_gigabytes: 10,
            name: `test-volume`,
            description: `Block store for sample`,
            region: `nyc3`,
            filesystem_type: `ext4`,
            filesystem_label: `ext4_volume_01`
        };
        const expected = {
            volume: {
                id: "506f78a4-e098-11e5-ad9f-000f53306ae1",
                region: {
                    name: "New York 1",
                    slug: "nyc1",
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
                        "s-32vcpu-192gb",
                    ],
                    features: ["private_networking", "backups", "ipv6", "metadata"],
                    available: true,
                },
                droplet_ids: [],
                name: "example",
                description: "Block store for examples",
                size_gigabytes: 10,
                filesystem_type: "ext4",
                filesystem_label: "example",
                created_at: "2020-03-02T17:00:49Z",
            },
        };
        const typeExpected = {
            volume: {
                id: "506f78a4-e098-11e5-ad9f-000f53306ae1",
                region: {
                    name: "New York 1",
                    slug: "nyc1",
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
                        "s-32vcpu-192gb",
                    ],
                    features: ["private_networking", "backups", "ipv6", "metadata"],
                    available: true,
                },
                dropletIds: [],
                name: "example",
                description: "Block store for examples",
                sizeGigabytes: 10,
                filesystemType: "ext4",
                filesystemLabel: "example",
                createdAt: "2020-03-02T17:00:49Z",
            },
        };
        nock(baseUrl).post("/v2/volumes", volumeReqNock).reply(201, expected);
        const resp = await client.v2.volumes.post(volumeReq);
        expect(resp).toEqual(typeExpected);
    });
    it("should delete a block storage volume by name", async () => {
        const volumeName = "volname";
        const region = "nyc1";
        nock(baseUrl)
            .delete(`/v2/volumes?name=${volumeName}&region=${region}`)
            .reply(204);
        const resp = await client.v2.volumes.delete({ queryParameters: { name: volumeName, region } });
        expect(resp).toBeUndefined();
    });
    it("should retrieve a block storage snapshot", async () => {
        const snapshotId = "506f78a4-e098-11e5-ad9f-000f53306ae1";
        const expected = {
            snapshot: {
                id: snapshotId,
                name: "big-data-snapshot1475261774",
                regions: ["nyc1"],
                created_at: "2020-09-30T18:56:14Z",
                resource_id: "82a48a18-873f-11e6-96bf-000f53315a41",
                resource_type: "volume",
                min_disk_size: 10,
                size_gigabytes: 10,
                tags: ["aninterestingtag"],
            },
        };
        const typeExpected = {
            snapshot: {
                id: snapshotId,
                name: "big-data-snapshot1475261774",
                regions: ["nyc1"],
                createdAt: new Date("2020-09-30T18:56:14Z"),
                resourceId: "82a48a18-873f-11e6-96bf-000f53315a41",
                resourceType: "volume",
                minDiskSize: 10,
                sizeGigabytes: 10,
                tags: ["aninterestingtag"],
            },
        };
        nock(baseUrl).get(`/v2/volumes/snapshots/${snapshotId}`).reply(200, expected);
        const resp = await client.v2.volumes.snapshots.bySnapshot_id(snapshotId).get();
        expect(resp).toEqual(typeExpected);
    });
    it("should list block storage snapshots", async () => {
        const volumeId = "1234";
        const expected = {
            snapshots: [
                {
                    id: "6372321",
                    name: "web-01-1595954862243",
                    created_at: "2020-07-28T16:47:44Z",
                    regions: ["nyc3", "sfo3"],
                    resource_id: "200776916",
                    resource_type: "droplet",
                    min_disk_size: 25,
                    size_gigabytes: 2.34,
                    tags: ["web", "env:prod"],
                },
            ],
            links: {},
            meta: { total: 1 },
        };
        const typeExpected = {
            snapshots: [
                {
                    id: "6372321",
                    name: "web-01-1595954862243",
                    createdAt: new Date("2020-07-28T16:47:44Z"),
                    regions: ["nyc3", "sfo3"],
                    resourceId: "200776916",
                    resourceType: "droplet",
                    minDiskSize: 25,
                    sizeGigabytes: 2.34,
                    tags: ["web", "env:prod"],
                },
            ],
            links: {},
            meta: { total: 1 },
        };
        nock(baseUrl).get(`/v2/volumes/${volumeId}/snapshots`).reply(200, expected);
        const resp = await client.v2.volumes.byVolume_id(volumeId).snapshots.get();
        expect(resp).toEqual(typeExpected);
    });
    it("should delete a block storage snapshot", async () => {
        const snapshotId = "6372321";
        nock(baseUrl).delete(`/v2/volumes/snapshots/${snapshotId}`).reply(204);
        const resp = await client.v2.volumes.snapshots.bySnapshot_id(snapshotId).delete();
        expect(resp).toBeUndefined();
    });
    it("should delete a block storage volume", async () => {
        const volumeId = "6372321";
        nock(baseUrl).delete(`/v2/volumes/${volumeId}`).reply(204);
        const resp = await client.v2.volumes.byVolume_id(volumeId).delete();
        expect(resp).toBeUndefined();
    });
    it("should create a block storage snapshot", async () => {
        const volumeId = "1234";
        const requestBody = { name: "big-data-snapshot1475261774" };
        const expected = {
            snapshot: {
                id: "8fa70202-873f-11e6-8b68-000f533176b1",
                name: "big-data-snapshot1475261774",
                regions: ["nyc1"],
                created_at: "2020-09-30T18:56:14Z",
                resource_id: "82a48a18-873f-11e6-96bf-000f53315a41",
                resource_type: "volume",
                min_disk_size: 10,
                size_gigabytes: 10,
                tags: ["aninterestingtag"],
            },
        };
        const typeExpected = {
            snapshot: {
                id: "8fa70202-873f-11e6-8b68-000f533176b1",
                name: "big-data-snapshot1475261774",
                regions: ["nyc1"],
                createdAt: new Date("2020-09-30T18:56:14Z"),
                resourceId: "82a48a18-873f-11e6-96bf-000f53315a41",
                resourceType: "volume",
                minDiskSize: 10,
                sizeGigabytes: 10,
                tags: ["aninterestingtag"],
            },
        };
        nock(baseUrl).post(`/v2/volumes/${volumeId}/snapshots`, requestBody).reply(201, expected);
        const resp = await client.v2.volumes.byVolume_id(volumeId).snapshots.post(requestBody);
        expect(resp).toEqual(typeExpected);
    });
});
