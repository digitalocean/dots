// images.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Images API", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should list images", async () => {
        const expected = {
            images: [
                {
                    id: 7555620,
                    name: "Nifty New Snapshot",
                    distribution: "Ubuntu",
                    slug: null,
                    public: false,
                    regions: ["nyc2", "nyc3"],
                    created_at: "2014-11-04T22:23:02Z",
                    type: "snapshot",
                    min_disk_size: 20,
                    size_gigabytes: 2.34,
                    description: "",
                    tags: [],
                    status: "available",
                    error_message: "",
                },
                {
                    id: 7555621,
                    name: "Another Snapshot",
                    distribution: "Ubuntu",
                    slug: null,
                    public: false,
                    regions: ["nyc2"],
                    created_at: "2014-11-04T22:23:02Z",
                    type: "snapshot",
                    min_disk_size: 20,
                    size_gigabytes: 2.34,
                    description: "",
                    tags: [],
                    status: "available",
                    error_message: "",
                },
                {
                    id: 63663980,
                    name: "20.04 (LTS) x64",
                    distribution: "Ubuntu",
                    slug: "ubuntu-20-04-x64",
                    public: true,
                    regions: ["nyc2", "nyc3"],
                    created_at: "2020-05-15T05:47:50Z",
                    type: "snapshot",
                    min_disk_size: 20,
                    size_gigabytes: 2.36,
                    description: "",
                    tags: [],
                    status: "available",
                    error_message: "",
                },
                {
                    id: 7555621,
                    name: "A custom image",
                    distribution: "Arch Linux",
                    slug: null,
                    public: false,
                    regions: ["nyc3"],
                    created_at: "2014-11-04T22:23:02Z",
                    type: "custom",
                    min_disk_size: 20,
                    size_gigabytes: 2.34,
                    description: "",
                    tags: [],
                    status: "available",
                    error_message: "",
                },
                {
                    id: 7555621,
                    name: "An APP image",
                    distribution: "Fedora",
                    slug: null,
                    public: false,
                    regions: ["nyc2", "nyc3"],
                    created_at: "2014-11-04T22:23:02Z",
                    type: "snapshot",
                    min_disk_size: 20,
                    size_gigabytes: 2.34,
                    description: "",
                    tags: [],
                    status: "available",
                    error_message: "",
                },
                {
                    id: 7555621,
                    name: "A simple tagged image",
                    distribution: "CentOS",
                    slug: null,
                    public: false,
                    regions: ["nyc2", "nyc3"],
                    created_at: "2014-11-04T22:23:02Z",
                    type: "snapshot",
                    min_disk_size: 20,
                    size_gigabytes: 2.34,
                    description: "",
                    tags: ["simple-image"],
                    status: "available",
                    error_message: "",
                },
            ],
            links: { pages: {} },
            meta: { total: 6 },
        };
        const typeExpected = {
            images: [
                {
                    id: 7555620,
                    name: "Nifty New Snapshot",
                    distribution: "Ubuntu",
                    slug: undefined,
                    public: false,
                    regions: ["nyc2", "nyc3"],
                    createdAt: new Date("2014-11-04T22:23:02Z"),
                    type: "snapshot",
                    minDiskSize: 20,
                    sizeGigabytes: 2.34,
                    description: "",
                    tags: [],
                    status: "available",
                    errorMessage: "",
                },
                {
                    id: 7555621,
                    name: "Another Snapshot",
                    distribution: "Ubuntu",
                    slug: undefined,
                    public: false,
                    regions: ["nyc2"],
                    createdAt: new Date("2014-11-04T22:23:02Z"),
                    type: "snapshot",
                    minDiskSize: 20,
                    sizeGigabytes: 2.34,
                    description: "",
                    tags: [],
                    status: "available",
                    errorMessage: "",
                },
                {
                    id: 63663980,
                    name: "20.04 (LTS) x64",
                    distribution: "Ubuntu",
                    slug: "ubuntu-20-04-x64",
                    public: true,
                    regions: ["nyc2", "nyc3"],
                    createdAt: new Date("2020-05-15T05:47:50Z"),
                    type: "snapshot",
                    minDiskSize: 20,
                    sizeGigabytes: 2.36,
                    description: "",
                    tags: [],
                    status: "available",
                    errorMessage: "",
                },
                {
                    id: 7555621,
                    name: "A custom image",
                    distribution: "Arch Linux",
                    slug: undefined,
                    public: false,
                    regions: ["nyc3"],
                    createdAt: new Date("2014-11-04T22:23:02Z"),
                    type: "custom",
                    minDiskSize: 20,
                    sizeGigabytes: 2.34,
                    description: "",
                    tags: [],
                    status: "available",
                    errorMessage: "",
                },
                {
                    id: 7555621,
                    name: "An APP image",
                    distribution: "Fedora",
                    slug: undefined,
                    public: false,
                    regions: ["nyc2", "nyc3"],
                    createdAt: new Date("2014-11-04T22:23:02Z"),
                    type: "snapshot",
                    minDiskSize: 20,
                    sizeGigabytes: 2.34,
                    description: "",
                    tags: [],
                    status: "available",
                    errorMessage: "",
                },
                {
                    id: 7555621,
                    name: "A simple tagged image",
                    distribution: "CentOS",
                    slug: undefined,
                    public: false,
                    regions: ["nyc2", "nyc3"],
                    createdAt: new Date("2014-11-04T22:23:02Z"),
                    type: "snapshot",
                    minDiskSize: 20,
                    sizeGigabytes: 2.34,
                    description: "",
                    tags: ["simple-image"],
                    status: "available",
                    errorMessage: "",
                },
            ],
            links: { pages: {} },
            meta: { total: 6 },
        };
        nock(baseUrl).get("/v2/images").reply(200, expected);
        const resp = await client.v2.images.get();
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should get image", async () => {
        const imageId = 6918990;
        const expected = {
            image: {
                id: 6918990,
                name: "14.04 x64",
                distribution: "Ubuntu",
                slug: "ubuntu-16-04-x64",
                public: true,
                regions: [
                    "nyc1",
                    "ams1",
                    "sfo1",
                    "nyc2",
                    "ams2",
                    "sgp1",
                    "lon1",
                    "nyc3",
                    "ams3",
                    "nyc3",
                ],
                created_at: "2014-10-17T20:24:33Z",
                min_disk_size: 20,
                size_gigabytes: 2.34,
                description: "",
                tags: [],
                status: "available",
                error_message: "",
            }
        };
        const typeExpected = {
            image: {
                id: 6918990,
                name: "14.04 x64",
                distribution: "Ubuntu",
                slug: "ubuntu-16-04-x64",
                public: true,
                regions: [
                    "nyc1",
                    "ams1",
                    "sfo1",
                    "nyc2",
                    "ams2",
                    "sgp1",
                    "lon1",
                    "nyc3",
                    "ams3",
                    "nyc3",
                ],
                createdAt: new Date("2014-10-17T20:24:33Z"),
                minDiskSize: 20,
                sizeGigabytes: 2.34,
                description: "",
                tags: [],
                status: "available",
                errorMessage: "",
            }
        };
        nock(baseUrl).get(`/v2/images/${imageId}`).reply(200, expected);
        const resp = await client.v2.images.byImage_id(imageId).get();
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should delete image", async () => {
        const imageId = 6372321;
        nock(baseUrl).delete(`/v2/images/${imageId}`).reply(204);
        const resp = await client.v2.images.byImage_id(imageId).delete();
        expect(resp).toBeUndefined();
    });
    it("should update image", async () => {
        const imageId = 7938391;
        const updateReq = {
            name: "Nifty New Snapshot",
            distribution: "Ubuntu",
            description: " ",
        };
        const updateReqNock = {
            name: "Nifty New Snapshot",
            distribution: "Ubuntu",
            description: " ",
        };
        const expected = {
            image: {
                id: 7938391,
                name: "new-image-name",
                distribution: "Ubuntu",
                slug: null,
                public: false,
                regions: ["nyc3", "nyc3"],
                created_at: "2014-11-14T16:44:03Z",
                min_disk_size: 20,
                size_gigabytes: 2.34,
                description: "",
                tags: [],
                status: "available",
                error_message: "",
            }
        };
        const typeExpected = {
            image: {
                id: 7938391,
                name: "new-image-name",
                distribution: "Ubuntu",
                slug: undefined,
                public: false,
                regions: ["nyc3", "nyc3"],
                createdAt: new Date("2014-11-14T16:44:03Z"),
                minDiskSize: 20,
                sizeGigabytes: 2.34,
                description: "",
                tags: [],
                status: "available",
                errorMessage: "",
            }
        };
        nock(baseUrl).put(`/v2/images/${imageId}`, updateReqNock).reply(200, expected);
        const resp = await client.v2.images.byImage_id(imageId).put(updateReq);
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should create custom image", async () => {
        const createReq = {
            name: "ubuntu-18.04-minimal",
            url: "http://cloud-images.ubuntu.com/minimal/releases/bionic/release/ubuntu-18.04-minimal-cloudimg-amd64.img",
            distribution: "Ubuntu",
            region: "nyc3",
            description: "Cloud-optimized image w/ small footprint",
            tags: ["base-image", "prod"],
        };
        const createReqNock = {
            name: "ubuntu-18.04-minimal",
            url: "http://cloud-images.ubuntu.com/minimal/releases/bionic/release/ubuntu-18.04-minimal-cloudimg-amd64.img",
            distribution: "Ubuntu",
            region: "nyc3",
            description: "Cloud-optimized image w/ small footprint",
            tags: ["base-image", "prod"],
        };
        const expected = {
            image: {
                created_at: "2018-09-20T19:28:00Z",
                description: "Cloud-optimized image w/ small footprint",
                distribution: "Ubuntu",
                error_message: "",
                id: 38413969,
                name: "ubuntu-18.04-minimal",
                regions: [],
                type: "custom",
                tags: ["base-image", "prod"],
                status: "NEW",
            }
        };
        const typeExpected = {
            image: {
                createdAt: new Date("2018-09-20T19:28:00Z"),
                description: "Cloud-optimized image w/ small footprint",
                distribution: "Ubuntu",
                errorMessage: "",
                id: 38413969,
                name: "ubuntu-18.04-minimal",
                regions: [],
                type: "custom",
                tags: ["base-image", "prod"],
                status: "NEW",
            }
        };
        nock(baseUrl).post("/v2/images", createReqNock).reply(202, expected);
        const resp = await client.v2.images.post(createReq);
        expect(resp).toStrictEqual(typeExpected);
    });
});
