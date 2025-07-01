// droplets.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { KiotaHelper } from "../../src/dots/KiotaHelper.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Droplets API", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should list droplets", async () => {
        const expected = {
            droplets: [
                {
                    id: 3164444,
                    name: "example.com",
                    memory: 1024,
                    vcpus: 1,
                    disk: 25,
                    locked: false,
                    status: "active",
                    kernel: {},
                    createdAt: "2020-07-21T18:37:44.000Z",
                    features: ["backups", "private_networking", "ipv6"],
                    backupIds: [53893572],
                    nextBackupWindow: {
                        start: "2020-07-30T00:00:00.000Z",
                        end: "2020-07-30T23:00:00.000Z",
                    },
                    snapshotIds: [67512819],
                    image: {
                        id: 63663980,
                        name: "20.04 (LTS) x64",
                        distribution: "Ubuntu",
                        slug: "ubuntu-20-04-x64",
                        public: true,
                        regions: [
                            "ams2",
                            "ams3",
                            "blr1",
                            "fra1",
                            "lon1",
                            "nyc1",
                            "nyc2",
                            "nyc3",
                            "sfo1",
                            "sfo2",
                            "sfo3",
                            "sgp1",
                            "tor1",
                        ],
                        createdAt: "2020-05-15T05:47:50.000Z",
                        type: "snapshot",
                        minDiskSize: 20,
                        sizeGigabytes: 2.36,
                        description: "",
                        tags: [],
                        status: "available",
                        errorMessage: "",
                    },
                    volumeIds: [],
                    size: {
                        slug: "s-1vcpu-1gb",
                        memory: 1024,
                        vcpus: 1,
                        disk: 25,
                        transfer: 1,
                        priceMonthly: 5,
                        priceHourly: 0.00743999984115362,
                        regions: [
                            "ams2",
                            "ams3",
                            "blr1",
                            "fra1",
                            "lon1",
                            "nyc1",
                            "nyc2",
                            "nyc3",
                            "sfo1",
                            "sfo2",
                            "sfo3",
                            "sgp1",
                            "tor1",
                        ],
                        available: true,
                        description: "Basic",
                    },
                    sizeSlug: "s-1vcpu-1gb",
                    networks: {
                        v4: [
                            {
                                ipAddress: "10.128.192.124",
                                netmask: "255.255.0.0",
                                gateway: "nil",
                                type: "private",
                            },
                            {
                                ipAddress: "192.241.165.154",
                                netmask: "255.255.255.0",
                                gateway: "192.241.165.1",
                                type: "public",
                            },
                        ],
                        v6: [
                            {
                                ipAddress: "2604:a880:0:1010::18a:a001",
                                netmask: 64,
                                gateway: "2604:a880:0:1010::1",
                                type: "public",
                            },
                        ],
                    },
                    region: {
                        name: "New York 3",
                        slug: "nyc3",
                        features: [
                            "privateNetworking",
                            "backups",
                            "ipv6",
                            "metadata",
                            "installAgent",
                            "storage",
                            "imageTransfer",
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
                    tags: ["web", "env:prod"],
                    vpcUuid: "760e09ef-dc84-11e8-981e-3cfdfeaae000",
                },
            ],
            links: { pages: {} },
            meta: { total: 1 },
        };
        nock(baseUrl).get("/v2/droplets").reply(200, expected);
        let resp = await client.v2.droplets.get();
        function traverseAndFlatten(obj) {
            if (Array.isArray(obj)) {
                return obj.map((item) => traverseAndFlatten(item));
            }
            else if (typeof obj === "object" && obj !== null) {
                const flattenedObj = {};
                for (const key in obj) {
                    if (key === "additionalData" && typeof obj[key] === "object") {
                        Object.assign(flattenedObj, traverseAndFlatten(obj[key]));
                    }
                    else {
                        flattenedObj[key] = traverseAndFlatten(obj[key]);
                    }
                }
                return flattenedObj;
            }
            return obj;
        }
        let flatten_data = traverseAndFlatten(resp);
        function unwrapKiota(obj) {
            if (Array.isArray(obj)) {
                return obj.map(unwrapKiota);
            }
            if (obj && typeof obj === "object") {
                // Unwrap { value: [...], getValue: ... } or { value: ..., getValue: ... }
                if (Object.keys(obj).length >= 1 &&
                    "value" in obj &&
                    typeof obj.getValue === "function") {
                    return unwrapKiota(obj.value);
                }
                // Recursively unwrap all properties
                const result = {};
                for (const key in obj) {
                    result[key] = unwrapKiota(obj[key]);
                }
                return result;
            }
            return obj;
        }
        let flatten_values = unwrapKiota(flatten_data);
        expect(flatten_values).toEqual(expected);
    });
    it('should create a droplet', async () => {
        const requestBody = {
            name: 'example.com',
            region: 'nyc3',
            size: 's-1vcpu-1gb',
            image: 'ubuntu-20-04-x64',
        };
        const expected = {
            "droplet": {
                "id": 3164444,
                "name": "example.com",
                "memory": 1024,
                "vcpus": 1,
                "disk": 25,
                "locked": false,
                "status": "new",
                "kernel": {},
                "createdAt": "2020-07-21T18:37:44.000Z",
                "features": [
                    "backups",
                    "private_networking",
                    "ipv6",
                    "monitoring",
                ],
                "backupIds": [],
                "nextBackupWindow": {},
                "snapshotIds": [],
                "image": {
                    "id": 63663980,
                    "name": "20.04 (LTS) x64",
                    "distribution": "Ubuntu",
                    "slug": "ubuntu-20-04-x64",
                    "public": true,
                    "regions": [
                        "ams2",
                        "ams3",
                        "blr1",
                        "fra1",
                        "lon1",
                        "nyc1",
                        "nyc2",
                        "nyc3",
                        "sfo1",
                        "sfo2",
                        "sfo3",
                        "sgp1",
                        "tor1",
                    ],
                    "createdAt": "2020-05-15T05:47:50.000Z",
                    "type": "snapshot",
                    "minDiskSize": 20,
                    "sizeGigabytes": 2.36,
                    "description": "",
                    "tags": [],
                    "status": "available",
                    "errorMessage": "",
                },
                "volumeIds": [],
                "size": {
                    "slug": "s-1vcpu-1gb",
                    "memory": 1024,
                    "vcpus": 1,
                    "disk": 25,
                    "transfer": 1,
                    "priceMonthly": 5,
                    "pricehourly": 0.00743999984115362,
                    "regions": [
                        "ams2",
                        "ams3",
                        "blr1",
                        "fra1",
                        "lon1",
                        "nyc1",
                        "nyc2",
                        "nyc3",
                        "sfo1",
                        "sfo2",
                        "sfo3",
                        "sgp1",
                        "tor1",
                    ],
                    "available": true,
                    "description": "Basic",
                },
                "sizeSlug": "s-1vcpu-1gb",
                "networks": { "v4": [], "v6": [] },
                "region": {
                    "name": "New York 3",
                    "slug": "nyc3",
                    "features": [
                        "private_networking",
                        "backups",
                        "ipv6",
                        "metadata",
                        "install_agent",
                        "storage",
                        "image_transfer",
                    ],
                    "available": true,
                    "sizes": [
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
                "tags": ["web", "env:prod"],
            },
            "links": {
                "actions": [
                    {
                        "id": 7515,
                        "rel": "create",
                        "href": "https://api.digitalocean.com/v2/actions/7515",
                    }
                ]
            },
        };
        nock(baseUrl)
            .post('/v2/droplets', requestBody)
            .reply(202, expected);
        // Kiota-generated client: create is a POST on v2.droplets.post()
        const resp = await client.v2.droplets.post(requestBody);
        function traverseAndFlatten(obj) {
            if (Array.isArray(obj)) {
                return obj.map((item) => traverseAndFlatten(item));
            }
            else if (typeof obj === "object" && obj !== null) {
                const flattenedObj = {};
                for (const key in obj) {
                    if (key === "additionalData" && typeof obj[key] === "object") {
                        Object.assign(flattenedObj, traverseAndFlatten(obj[key]));
                    }
                    else {
                        flattenedObj[key] = traverseAndFlatten(obj[key]);
                    }
                }
                return flattenedObj;
            }
            return obj;
        }
        let flatten_data = traverseAndFlatten(resp);
        function unwrapKiota(obj) {
            if (Array.isArray(obj)) {
                return obj.map(unwrapKiota);
            }
            if (obj && typeof obj === "object") {
                // Unwrap { value: [...], getValue: ... } or { value: ..., getValue: ... }
                if (Object.keys(obj).length >= 1 &&
                    "value" in obj &&
                    typeof obj.getValue === "function") {
                    return unwrapKiota(obj.value);
                }
                // Recursively unwrap all properties
                const result = {};
                for (const key in obj) {
                    result[key] = unwrapKiota(obj[key]);
                }
                return result;
            }
            return obj;
        }
        let flatten_values = unwrapKiota(flatten_data);
        expect(flatten_values).toEqual(expected);
    });
    it('should get a droplet by id', async () => {
        const dropletId = 1;
        const expected = {
            "droplet": {
                "id": 3164444,
                "name": "example.com",
                "memory": 1024,
                "vcpus": 1,
                "disk": 25,
                "locked": false,
                "status": "active",
                "kernel": {}
            },
            "created_at": "2020-07-21T18:37:44.000Z",
            "features": ["backups", "private_networking", "ipv6"],
            "backup_ids": [53893572],
            "next_backup_window": {
                "start": "2020-07-30T00:00:00.000Z",
                "end": "2020-07-30T23:00:00.000Z",
            },
            "snapshot_ids": [67512819],
            "image": {
                "id": 63663980,
                "name": "20.04 (LTS) x64",
                "distribution": "Ubuntu",
                "slug": "ubuntu-20-04-x64",
                "public": true,
                "regions": [
                    "ams2",
                    "ams3",
                    "blr1",
                    "fra1",
                    "lon1",
                    "nyc1",
                    "nyc2",
                    "nyc3",
                    "sfo1",
                    "sfo2",
                    "sfo3",
                    "sgp1",
                    "tor1",
                ],
                "created_at": "2020-05-15T05:47:50.000Z",
                "type": "snapshot",
                "min_disk_size": 20,
                "size_gigabytes": 2.36,
                "description": "",
                "tags": [],
                "status": "available",
                "error_message": "",
            },
            "volume_ids": [],
            "size": {
                "slug": "s-1vcpu-1gb",
                "memory": 1024,
                "vcpus": 1,
                "disk": 25,
                "transfer": 1,
                "price_monthly": 5,
                "price_hourly": 0.00743999984115362,
                "regions": [
                    "ams2",
                    "ams3",
                    "blr1",
                    "fra1",
                    "lon1",
                    "nyc1",
                    "nyc2",
                    "nyc3",
                    "sfo1",
                    "sfo2",
                    "sfo3",
                    "sgp1",
                    "tor1",
                ],
                "available": true,
                "description": "Basic",
            },
            "size_slug": "s-1vcpu-1gb",
            "networks": {
                "v4": [
                    {
                        "ip_address": "10.128.192.124",
                        "netmask": "255.255.0.0",
                        "gateway": "nil",
                        "type": "private",
                    },
                    {
                        "ip_address": "192.241.165.154",
                        "netmask": "255.255.255.0",
                        "gateway": "192.241.165.1",
                        "type": "public",
                    },
                ],
                "v6": [
                    {
                        "ip_address": "2604:a880:0:1010::18a:a001",
                        "netmask": 64,
                        "gateway": "2604:a880:0:1010::1",
                        "type": "public",
                    }
                ],
            },
            "region": {
                "name": "New York 3",
                "slug": "nyc3",
                "features": [
                    "private_networking",
                    "backups",
                    "ipv6",
                    "metadata",
                    "install_agent",
                    "storage",
                    "image_transfer",
                ],
                "available": true,
                "sizes": [
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
            "tags": ["web", "env:prod"],
            "vpc_uuid": "760e09ef-dc84-11e8-981e-3cfdfeaae000",
        };
        nock(baseUrl)
            .get(`/v2/droplets/${dropletId}`)
            .reply(200, expected);
        // Kiota-generated client: get by id is v2.droplets.byDroplet_id(id).get()
        const resp = await client.v2.droplets.byDroplet_id(dropletId).get();
        function traverseAndFlatten(obj) {
            if (Array.isArray(obj)) {
                return obj.map((item) => traverseAndFlatten(item));
            }
            else if (typeof obj === "object" && obj !== null) {
                const flattenedObj = {};
                for (const key in obj) {
                    if (key === "additionalData" && typeof obj[key] === "object") {
                        Object.assign(flattenedObj, traverseAndFlatten(obj[key]));
                    }
                    else {
                        flattenedObj[key] = traverseAndFlatten(obj[key]);
                    }
                }
                return flattenedObj;
            }
            return obj;
        }
        let flatten_data = traverseAndFlatten(resp);
        function unwrapKiota(obj) {
            if (Array.isArray(obj)) {
                return obj.map(unwrapKiota);
            }
            if (obj && typeof obj === "object") {
                // Unwrap { value: [...], getValue: ... } or { value: ..., getValue: ... }
                if (Object.keys(obj).length >= 1 &&
                    "value" in obj &&
                    typeof obj.getValue === "function") {
                    return unwrapKiota(obj.value);
                }
                // Recursively unwrap all properties
                const result = {};
                for (const key in obj) {
                    result[key] = unwrapKiota(obj[key]);
                }
                return result;
            }
            return obj;
        }
        let flatten_values = unwrapKiota(flatten_data);
        expect(flatten_values).toEqual(expected);
    });
    it('should delete a droplet by id', async () => {
        const dropletId = 1;
        nock(baseUrl)
            .delete(`/v2/droplets/${dropletId}`)
            .reply(204);
        // Kiota-generated client: delete by id is v2.droplets.byDroplet_id(id).delete()
        const resp = await client.v2.droplets.byDroplet_id(dropletId).delete();
        expect(resp).toBeUndefined(); // 204 No Content
    });
    it('should delete droplets by tag', async () => {
        const tagName = 'awesome';
        nock(baseUrl)
            .delete('/v2/droplets')
            .query({ tag_name: tagName })
            .reply(204);
        // Kiota-generated client: delete by tag is v2.droplets.delete({ tagName })
        const resp = await client.v2.droplets.delete({ queryParameters: { tagName } });
        expect(resp).toBeUndefined();
    });
    it("mocks the droplets list backups operation", async () => {
        const expected = {
            backups: [
                {
                    id: 67539192,
                    name: "web-01- 2020-07-29",
                    distribution: "Ubuntu",
                    slug: null,
                    public: false,
                    regions: ["nyc3"],
                    createdAt: "2020-07-29T01:44:35Z",
                    minDiskSize: 50,
                    sizeGigabytes: 2.34,
                    type: "backup",
                },
            ],
            links: {},
            meta: { total: 1 },
        };
        const dropletId = 1;
        nock(baseUrl)
            .get(`/v2/droplets/${dropletId}/backups`)
            .reply(200, expected);
        const resp = await client.v2.droplets.byDroplet_id(dropletId).backups.get();
        function traverseAndFlatten(obj) {
            if (Array.isArray(obj)) {
                return obj.map((item) => traverseAndFlatten(item));
            }
            else if (typeof obj === "object" && obj !== null) {
                const flattenedObj = {};
                for (const key in obj) {
                    if (key === "additionalData" && typeof obj[key] === "object") {
                        Object.assign(flattenedObj, traverseAndFlatten(obj[key]));
                    }
                    else {
                        flattenedObj[key] = traverseAndFlatten(obj[key]);
                    }
                }
                return flattenedObj;
            }
            return obj;
        }
        let flatten_data = traverseAndFlatten(resp);
        function unwrapKiota(obj) {
            if (Array.isArray(obj)) {
                return obj.map(unwrapKiota);
            }
            if (obj && typeof obj === "object") {
                // Unwrap { value: [...], getValue: ... } or { value: ..., getValue: ... }
                if (Object.keys(obj).length >= 1 &&
                    "value" in obj &&
                    typeof obj.getValue === "function") {
                    return unwrapKiota(obj.value);
                }
                // Recursively unwrap all properties
                const result = {};
                for (const key in obj) {
                    result[key] = unwrapKiota(obj[key]);
                }
                return result;
            }
            return obj;
        }
        let flatten_values = unwrapKiota(flatten_data);
        const kiota_values = KiotaHelper.flattenAndUnwrap(resp);
        expect(kiota_values).toEqual(expected);
    });
});
