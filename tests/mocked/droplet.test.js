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
                    disk_info: [
                        {
                            type: "local",
                            size: {
                                amount: 25,
                                unit: "gib",
                            },
                        },
                    ],
                    locked: false,
                    status: "active",
                    kernel: {},
                    created_at: new Date("2020-07-21T18:37:44Z"),
                    features: ["backups", "private_networking", "ipv6"],
                    backup_ids: [53893572],
                    next_backup_window: {
                        start: new Date("2020-07-30T00:00:00Z"),
                        end: new Date("2020-07-30T23:00:00Z"),
                    },
                    snapshot_ids: [67512819],
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
                        created_at: new Date("2020-05-15T05:47:50Z"),
                        type: "snapshot",
                        min_disk_size: 20,
                        size_gigabytes: 2.36,
                        description: "",
                        tags: [],
                        status: "available",
                        error_message: "",
                    },
                    volume_ids: [],
                    size: {
                        slug: "s-1vcpu-1gb",
                        memory: 1024,
                        vcpus: 1,
                        disk: 25,
                        transfer: 1,
                        price_monthly: 5,
                        price_hourly: 0.00743999984115362,
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
                    size_slug: "s-1vcpu-1gb",
                    networks: {
                        v4: [
                            {
                                ip_address: "10.128.192.124",
                                netmask: "255.255.0.0",
                                gateway: "nil",
                                type: "private",
                            },
                            {
                                ip_address: "192.241.165.154",
                                netmask: "255.255.255.0",
                                gateway: "192.241.165.1",
                                type: "public",
                            },
                        ],
                        v6: [
                            {
                                ip_address: "2604:a880:0:1010::18a:a001",
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
                    tags: ["web", "env:prod"],
                    vpc_uuid: "760e09ef-dc84-11e8-981e-3cfdfeaae000",
                },
                {
                    id: 3164459,
                    name: "assets.example.com",
                    memory: 1024,
                    vcpus: 1,
                    disk: 25,
                    disk_info: [
                        {
                            type: "local",
                            size: {
                                amount: 25,
                                unit: "gib",
                            },
                        },
                    ],
                    locked: false,
                    status: "active",
                    kernel: {},
                    created_at: new Date("2020-07-21T18:42:27Z"),
                    features: ["private_networking"],
                    backup_ids: [],
                    next_backup_window: {
                        start: new Date("2020-07-30T00:00:00Z"),
                        end: new Date("2020-07-30T23:00:00Z"),
                    },
                    snapshot_ids: [],
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
                        created_at: new Date("2020-05-15T05:47:50Z"),
                        type: "snapshot",
                        min_disk_size: 20,
                        size_gigabytes: 2.36,
                        description: "",
                        tags: [],
                        status: "available",
                        error_message: "",
                    },
                    volume_ids: ["506f78a4-e098-11e5-ad9f-000f53306ae1"],
                    size: {
                        slug: "s-1vcpu-1gb",
                        memory: 1024,
                        vcpus: 1,
                        disk: 25,
                        transfer: 1,
                        price_monthly: 5,
                        price_hourly: 0.00743999984115362,
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
                    size_slug: "s-1vcpu-1gb",
                    networks: {
                        v4: [
                            {
                                ip_address: "10.128.192.138",
                                netmask: "255.255.0.0",
                                gateway: "nil",
                                type: "private",
                            },
                            {
                                ip_address: "162.243.0.4",
                                netmask: "255.255.255.0",
                                gateway: "162.243.0.1",
                                type: "public",
                            },
                        ],
                        v6: [],
                    },
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
                    tags: ["storage", "env:prod"],
                    vpc_uuid: "760e09ef-dc84-11e8-981e-3cfdfeaae000",
                },
                {
                    id: 3164412,
                    name: "stage.example.com",
                    memory: 1024,
                    vcpus: 1,
                    disk: 25,
                    disk_info: [
                        {
                            type: "local",
                            size: {
                                amount: 25,
                                unit: "gib",
                            },
                        },
                    ],
                    locked: false,
                    status: "active",
                    kernel: {},
                    created_at: new Date("2020-07-21T18:32:55Z"),
                    features: ["private_networking"],
                    backup_ids: [],
                    next_backup_window: {
                        start: new Date("2020-07-30T00:00:00Z"),
                        end: new Date("2020-07-30T23:00:00Z"),
                    },
                    snapshot_ids: [],
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
                        created_at: new Date("2020-05-15T05:47:50Z"),
                        type: "snapshot",
                        min_disk_size: 20,
                        size_gigabytes: 2.36,
                        description: "",
                        tags: [],
                        status: "available",
                        error_message: "",
                    },
                    volume_ids: ["7724db7c-e098-11e5-b522-000f53304e51"],
                    size: {
                        slug: "s-1vcpu-1gb",
                        memory: 1024,
                        vcpus: 1,
                        disk: 25,
                        transfer: 1,
                        price_monthly: 5,
                        price_hourly: 0.00743999984115362,
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
                    size_slug: "s-1vcpu-1gb",
                    networks: {
                        v4: [
                            {
                                ip_address: "10.128.192.125",
                                netmask: "255.255.0.0",
                                gateway: "nil",
                                type: "private",
                            },
                            {
                                ip_address: "192.241.247.248",
                                netmask: "255.255.255.0",
                                gateway: "192.241.247.1",
                                type: "public",
                            },
                        ],
                        v6: [],
                    },
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
                    tags: ["env:stage"],
                    vpc_uuid: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                },
            ],
            links: {
                pages: {},
            },
            meta: {
                total: 3,
            },
        };
        const typeExpected = {
            droplets: [
                {
                    id: 3164444,
                    name: "example.com",
                    memory: 1024,
                    vcpus: 1,
                    disk: 25,
                    diskInfo: [
                        {
                            type: "local",
                            size: {
                                amount: 25,
                                unit: "gib",
                            },
                        },
                    ],
                    locked: false,
                    status: "active",
                    kernel: {},
                    createdAt: new Date("2020-07-21T18:37:44Z"),
                    features: ["backups", "private_networking", "ipv6"],
                    backupIds: [53893572],
                    nextBackupWindow: {
                        start: new Date("2020-07-30T00:00:00Z"),
                        end: new Date("2020-07-30T23:00:00Z"),
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
                        createdAt: new Date("2020-05-15T05:47:50Z"),
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
                    tags: ["web", "env:prod"],
                    vpcUuid: "760e09ef-dc84-11e8-981e-3cfdfeaae000",
                },
                {
                    id: 3164459,
                    name: "assets.example.com",
                    memory: 1024,
                    vcpus: 1,
                    disk: 25,
                    diskInfo: [
                        {
                            type: "local",
                            size: {
                                amount: 25,
                                unit: "gib",
                            },
                        },
                    ],
                    locked: false,
                    status: "active",
                    kernel: {},
                    createdAt: new Date("2020-07-21T18:42:27Z"),
                    features: ["private_networking"],
                    backupIds: [],
                    nextBackupWindow: {
                        start: new Date("2020-07-30T00:00:00Z"),
                        end: new Date("2020-07-30T23:00:00Z"),
                    },
                    snapshotIds: [],
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
                        createdAt: new Date("2020-05-15T05:47:50Z"),
                        type: "snapshot",
                        minDiskSize: 20,
                        sizeGigabytes: 2.36,
                        description: "",
                        tags: [],
                        status: "available",
                        errorMessage: "",
                    },
                    volumeIds: ["506f78a4-e098-11e5-ad9f-000f53306ae1"],
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
                                ipAddress: "10.128.192.138",
                                netmask: "255.255.0.0",
                                gateway: "nil",
                                type: "private",
                            },
                            {
                                ipAddress: "162.243.0.4",
                                netmask: "255.255.255.0",
                                gateway: "162.243.0.1",
                                type: "public",
                            },
                        ],
                        v6: [],
                    },
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
                    tags: ["storage", "env:prod"],
                    vpcUuid: "760e09ef-dc84-11e8-981e-3cfdfeaae000",
                },
                {
                    id: 3164412,
                    name: "stage.example.com",
                    memory: 1024,
                    vcpus: 1,
                    disk: 25,
                    diskInfo: [
                        {
                            type: "local",
                            size: {
                                amount: 25,
                                unit: "gib",
                            },
                        },
                    ],
                    locked: false,
                    status: "active",
                    kernel: {},
                    createdAt: new Date("2020-07-21T18:32:55Z"),
                    features: ["private_networking"],
                    backupIds: [],
                    nextBackupWindow: {
                        start: new Date("2020-07-30T00:00:00Z"),
                        end: new Date("2020-07-30T23:00:00Z"),
                    },
                    snapshotIds: [],
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
                        createdAt: new Date("2020-05-15T05:47:50Z"),
                        type: "snapshot",
                        minDiskSize: 20,
                        sizeGigabytes: 2.36,
                        description: "",
                        tags: [],
                        status: "available",
                        errorMessage: "",
                    },
                    volumeIds: ["7724db7c-e098-11e5-b522-000f53304e51"],
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
                                ipAddress: "10.128.192.125",
                                netmask: "255.255.0.0",
                                gateway: "nil",
                                type: "private",
                            },
                            {
                                ipAddress: "192.241.247.248",
                                netmask: "255.255.255.0",
                                gateway: "192.241.247.1",
                                type: "public",
                            },
                        ],
                        v6: [],
                    },
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
                    tags: ["env:stage"],
                    vpcUuid: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                },
            ],
            links: {
                pages: {},
            },
            meta: {
                total: 3,
            },
        };
        nock(baseUrl).get("/v2/droplets").reply(200, expected);
        let resp = await client.v2.droplets.get();
        expect(resp).toEqual(typeExpected);
    });
    it('should create a droplet', async () => {
        const requestBody = {
            name: 'example.com',
            region: 'nyc3',
            size: 's-1vcpu-1gb',
            image: 'ubuntu-20-04-x64',
        };
        // const  expected = {
        //     "droplet": {
        //         "id": 3164444,
        //         "name": "example.com",
        //         "memory": 1024,
        //         "vcpus": 1,
        //         "disk": 25,
        //         "locked": false,
        //         "status": "new",
        //         "kernel": {},
        //         "createdAt": "2020-07-21T18:37:44.000Z",
        //         "features": [
        //             "backups",
        //             "private_networking",
        //             "ipv6",
        //             "monitoring",
        //         ],
        //         "backupIds": [],
        //         "nextBackupWindow": {},
        //         "snapshotIds": [],
        //         "image": {
        //             "id": 63663980,
        //             "name": "20.04 (LTS) x64",
        //             "distribution": "Ubuntu",
        //             "slug": "ubuntu-20-04-x64",
        //             "public": true,
        //             "regions": [
        //                 "ams2",
        //                 "ams3",
        //                 "blr1",
        //                 "fra1",
        //                 "lon1",
        //                 "nyc1",
        //                 "nyc2",
        //                 "nyc3",
        //                 "sfo1",
        //                 "sfo2",
        //                 "sfo3",
        //                 "sgp1",
        //                 "tor1",
        //             ],
        //             "createdAt": "2020-05-15T05:47:50.000Z",
        //             "type": "snapshot",
        //             "minDiskSize": 20,
        //             "sizeGigabytes": 2.36,
        //             "description": "",
        //             "tags": [],
        //             "status": "available",
        //             "errorMessage": "",
        //         },
        //         "volumeIds": [],
        //         "size": {
        //             "slug": "s-1vcpu-1gb",
        //             "memory": 1024,
        //             "vcpus": 1,
        //             "disk": 25,
        //             "transfer": 1,
        //             "priceMonthly": 5,
        //             "pricehourly": 0.00743999984115362,
        //             "regions": [
        //                 "ams2",
        //                 "ams3",
        //                 "blr1",
        //                 "fra1",
        //                 "lon1",
        //                 "nyc1",
        //                 "nyc2",
        //                 "nyc3",
        //                 "sfo1",
        //                 "sfo2",
        //                 "sfo3",
        //                 "sgp1",
        //                 "tor1",
        //             ],
        //             "available": true,
        //             "description": "Basic",
        //         },
        //         "sizeSlug": "s-1vcpu-1gb",
        //         "networks": {"v4": [], "v6": []},
        //         "region": {
        //             "name": "New York 3",
        //             "slug": "nyc3",
        //             "features": [
        //                 "private_networking",
        //                 "backups",
        //                 "ipv6",
        //                 "metadata",
        //                 "install_agent",
        //                 "storage",
        //                 "image_transfer",
        //             ],
        //             "available": true,
        //             "sizes": [
        //                 "s-1vcpu-1gb",
        //                 "s-1vcpu-2gb",
        //                 "s-1vcpu-3gb",
        //                 "s-2vcpu-2gb",
        //                 "s-3vcpu-1gb",
        //                 "s-2vcpu-4gb",
        //                 "s-4vcpu-8gb",
        //                 "s-6vcpu-16gb",
        //                 "s-8vcpu-32gb",
        //                 "s-12vcpu-48gb",
        //                 "s-16vcpu-64gb",
        //                 "s-20vcpu-96gb",
        //                 "s-24vcpu-128gb",
        //                 "s-32vcpu-192g",
        //             ],
        //         },
        //         "tags": ["web", "env:prod"],
        //     },
        //     "links": {
        //         "actions": [
        //             {
        //                 "id": 7515,
        //                 "rel": "create",
        //                 "href": "https://api.digitalocean.com/v2/actions/7515",
        //             }
        //         ]
        //     },
        // }
        const expected = {
            droplet: {
                id: 3164444,
                name: "example.com",
                memory: 1024,
                vcpus: 1,
                disk: 25,
                locked: false,
                status: "new",
                kernel: {},
                created_at: new Date("2020-07-21T18:37:44.000Z"),
                features: ["backups", "private_networking", "ipv6", "monitoring"],
                backup_ids: [],
                next_backup_window: {},
                snapshot_ids: [],
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
                    created_at: new Date("2020-05-15T05:47:50.000Z"),
                    type: "snapshot",
                    min_disk_size: 20,
                    size_gigabytes: 2.36,
                    description: "",
                    tags: [],
                    status: "available",
                    error_message: "",
                },
                volume_ids: [],
                size: {
                    slug: "s-1vcpu-1gb",
                    memory: 1024,
                    vcpus: 1,
                    disk: 25,
                    transfer: 1,
                    price_monthly: 5,
                    price_hourly: 0.00743999984115362,
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
                size_slug: "s-1vcpu-1gb",
                networks: { v4: [], v6: [] },
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
                tags: ["web", "env:prod"],
            },
            links: {
                actions: [
                    {
                        id: 7515,
                        rel: "create",
                        href: "https://api.digitalocean.com/v2/actions/7515",
                    },
                ],
            },
        };
        const typeExpected = {
            "droplet": {
                "id": 3164444,
                "name": "example.com",
                "memory": 1024,
                "vcpus": 1,
                "disk": 25,
                "locked": false,
                "status": "new",
                "kernel": {},
                "createdAt": new Date("2020-07-21T18:37:44.000Z"),
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
                    "createdAt": new Date("2020-05-15T05:47:50.000Z"),
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
                    "priceHourly": 0.00743999984115362,
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
        const resp = await client.v2.droplets.post(requestBody);
        expect(resp).toEqual(typeExpected);
    });
    it('should get a droplet by id', async () => {
        const dropletId = 1;
        const expected = {
            droplet: {
                id: 3164444,
                name: "example.com",
                memory: 1024,
                vcpus: 1,
                disk: 25,
                disk_info: [
                    {
                        type: "local",
                        size: {
                            amount: 25,
                            unit: "gib",
                        },
                    },
                ],
                locked: false,
                status: "active",
                kernel: null,
                created_at: "2020-07-21T18:37:44Z",
                features: ["backups", "private_networking", "ipv6"],
                backup_ids: [53893572],
                next_backup_window: {
                    start: "2020-07-30T00:00:00Z",
                    end: "2020-07-30T23:00:00Z",
                },
                snapshot_ids: [67512819],
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
                    created_at: "2020-05-15T05:47:50Z",
                    type: "snapshot",
                    min_disk_size: 20,
                    size_gigabytes: 2.36,
                    description: "",
                    tags: [],
                    status: "available",
                    error_message: "",
                },
                volume_ids: [],
                size: {
                    slug: "s-1vcpu-1gb",
                    memory: 1024,
                    vcpus: 1,
                    disk: 25,
                    transfer: 1,
                    price_monthly: 5,
                    price_hourly: 0.00743999984115362,
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
                size_slug: "s-1vcpu-1gb",
                networks: {
                    v4: [
                        {
                            ip_address: "10.128.192.124",
                            netmask: "255.255.0.0",
                            gateway: "nil",
                            type: "private",
                        },
                        {
                            ip_address: "192.241.165.154",
                            netmask: "255.255.255.0",
                            gateway: "192.241.165.1",
                            type: "public",
                        },
                    ],
                    v6: [
                        {
                            ip_address: "2604:a880:0:1010::18a:a001",
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
                tags: ["web", "env:prod"],
                vpc_uuid: "760e09ef-dc84-11e8-981e-3cfdfeaae000",
            },
        };
        const typeExpected = {
            droplet: {
                id: 3164444,
                name: "example.com",
                memory: 1024,
                vcpus: 1,
                disk: 25,
                diskInfo: [
                    {
                        type: "local",
                        size: {
                            amount: 25,
                            unit: "gib",
                        },
                    },
                ],
                locked: false,
                status: "active",
                kernel: {},
                createdAt: new Date("2020-07-21T18:37:44Z"),
                features: ["backups", "private_networking", "ipv6"],
                backupIds: [53893572],
                nextBackupWindow: {
                    start: new Date("2020-07-30T00:00:00Z"),
                    end: new Date("2020-07-30T23:00:00Z"),
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
                    createdAt: new Date("2020-05-15T05:47:50Z"),
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
                tags: ["web", "env:prod"],
                vpcUuid: "760e09ef-dc84-11e8-981e-3cfdfeaae000",
            },
        };
        nock(baseUrl)
            .get(`/v2/droplets/${dropletId}`)
            .reply(200, expected);
        const resp = await client.v2.droplets.byDroplet_id(dropletId).get();
        expect(resp).toEqual(typeExpected);
    });
    it('should delete a droplet by id', async () => {
        const dropletId = 1;
        nock(baseUrl)
            .delete(`/v2/droplets/${dropletId}`)
            .reply(204);
        const resp = await client.v2.droplets.byDroplet_id(dropletId).delete();
        expect(resp).toBeUndefined(); // 204 No Content
    });
    it('should delete droplets by tag', async () => {
        const tagName = 'awesome';
        nock(baseUrl)
            .delete('/v2/droplets')
            .query({ tag_name: tagName })
            .reply(204);
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
                    created_at: "2020-07-29T01:44:35Z",
                    min_disk_size: 50,
                    size_gigabytes: 2.34,
                    type: "backup",
                },
            ],
            links: {},
            meta: {
                total: 1,
            },
        };
        const dropletId = 1;
        nock(baseUrl)
            .get(`/v2/droplets/${dropletId}/backups`)
            .reply(200, expected);
        const resp = await client.v2.droplets.byDroplet_id(dropletId).backups.get();
        expect(resp).toEqual(expected);
    });
    // it("mocks the droplets list kernels operation", async () => {
    //     const expected = {
    //     kernels: [
    //         {
    //         id: 7515,
    //         name: "DigitalOcean GrubLoader v0.2 (20160714)",
    //         version: "2016.07.13-DigitalOcean_loader_Ubuntu",
    //         },
    //     ],
    //     links: {
    //         pages: {
    //         next: "https://api.digitalocean.com/v2/droplets/3164444/kernels?page=2&per_page=1",
    //         last: "https://api.digitalocean.com/v2/droplets/3164444/kernels?page=171&per_page=1",
    //         },
    //     },
    //     meta: { total: 171 },
    //     };
    //     const dropletId = 3929391;
    //     nock(baseUrl)
    //     .get(`/v2/droplets/${dropletId}/kernels`)
    //     .reply(200, expected);
    //     const resp = await client.v2.droplets.byDroplet_id(dropletId).kernels.get();
    //     const kiota_processed_data = KiotaHelper.flattenAndUnwrap(resp);
    //     expect(kiota_processed_data).toEqual(expected);
    // });
    //     it("mocks the droplets list firewalls operation", async () => {
    //         const expected = {
    //         firewalls: [
    //             {
    //             id: "bb4b2611-3d72-467b-8602-280330ecd65c",
    //             status: "succeeded",
    //             createdAt: "2020-05-23T21:24:00Z",
    //             pendingChanges: [
    //                 { dropletId: 8043964, removing: true, status: "waiting" }
    //             ],
    //             name: "firewall",
    //             dropletIds: [89989, 33322],
    //             tags: ["base-image", "prod"],
    //             inboundRules: [
    //                 {
    //                 protocol: "udp",
    //                 ports: "8000-9000",
    //                 sources: {
    //                     addresses: ["1.2.3.4", "18.0.0.0/8"],
    //                     dropletIds: [8282823, 3930392],
    //                     loadBalancerUids: [
    //                     "4de7ac8b-495b-4884-9a69-1050c6793cd6"
    //                     ],
    //                     tags: ["base-image", "dev"],
    //                 },
    //                 }
    //             ],
    //             outboundRules: [
    //                 {
    //                 protocol: "tcp",
    //                 ports: "7000-9000",
    //                 destinations: {
    //                     addresses: ["1.2.3.4", "18.0.0.0/8"],
    //                     dropletIds: [3827493, 213213],
    //                     loadBalancerUids: [
    //                     "4de7ac8b-495b-4884-9a69-1050c6793cd6"
    //                     ],
    //                     tags: ["base-image", "prod"],
    //                 },
    //                 }
    //             ],
    //             }
    //         ],
    //         links: { pages: {} },
    //         meta: { total: 1 },
    //         };
    //         const dropletId = 3164444;
    //         nock(baseUrl)
    //         .get(`/v2/droplets/${dropletId}/firewalls`)
    //         .reply(200, expected);
    //         const resp = await client.v2.droplets.byDroplet_id(dropletId).firewalls.get();
    //         const kiota_processed_data = KiotaHelper.flattenAndUnwrap(resp);
    //         expect(kiota_processed_data).toEqual(expected);
    //     });
    //     it("mocks the droplets neighbors operation", async () => {
    //         const expected = {
    //         "droplets": [
    //             {
    //                 "id": 3164444,
    //                 "name": "example.com",
    //                 "memory": 1024,
    //                 "vcpus": 1,
    //                 "disk": 25,
    //                 "locked": false,
    //                 "status": "active",
    //                 "kernel": {
    //                     "id": 7515,
    //                     "name": "DigitalOcean GrubLoader v0.2 (20160714)",
    //                     "version": "2016.07.13-DigitalOcean_loader_Ubuntu",
    //                 },
    //                 "createdAt": "2020-07-21T18:37:44Z",
    //                 "features": ["backups", "private_networking", "ipv6"],
    //                 "backupIds": [53893572],
    //                 "nextBckupWindow": {
    //                     "start": "2019-12-04T00:00:00Z",
    //                     "end": "2019-12-04T23:00:00Z",
    //                 },
    //                 "snapshotIds": [67512819],
    //                 "image": {
    //                     "id": 7555620,
    //                     "name": "Nifty New Snapshot",
    //                     "type": "snapshot",
    //                     "distribution": "Ubuntu",
    //                     "slug": "nifty1",
    //                     "public": true,
    //                     "regions": ["nyc1", "nyc2"],
    //                     "createdAt": "2020-05-04T22:23:02Z",
    //                     "minDiskSize": 20,
    //                     "sizeGigabytes": 2.34,
    //                     "description": " ",
    //                     "tags": ["base-image", "prod"],
    //                     "status": "NEW",
    //                     "errorMessage": " ",
    //                 },
    //                 "volumeIds": ["506f78a4-e098-11e5-ad9f-000f53306ae1"],
    //                 "size": {
    //                     "slug": "s-1vcpu-1gb",
    //                     "memory": 1024,
    //                     "vcpus": 1,
    //                     "disk": 25,
    //                     "transfer": 1,
    //                     "priceMonthly": 5,
    //                     "priceHourly": 0.00743999984115362,
    //                     "regions": [
    //                         "ams2",
    //                         "ams3",
    //                         "blr1",
    //                         "fra1",
    //                         "lon1",
    //                         "nyc1",
    //                         "nyc2",
    //                         "nyc3",
    //                         "sfo1",
    //                         "sfo2",
    //                         "sfo3",
    //                         "sgp1",
    //                         "tor1",
    //                     ],
    //                     "available": true,
    //                     "description": "Basic",
    //                 },
    //                 "sizeSlug": "s-1vcpu-1gb",
    //                 "networks": {
    //                     "v4": [
    //                         {
    //                             "ipAddress": "104.236.32.182",
    //                             "netmask": "255.255.192.0",
    //                             "gateway": "104.236.0.1",
    //                             "type": "public",
    //                         }
    //                     ],
    //                     "v6": [
    //                         {
    //                             "ipAddress": "2604:a880:0:1010::18a:a001",
    //                             "netmask": 64,
    //                             "gateway": "2604:a880:0:1010::1",
    //                             "type": "public",
    //                         }
    //                     ],
    //                 },
    //                 "region": {
    //                     "name": "New York 3",
    //                     "slug": "nyc3",
    //                     "features": [
    //                         "private_networking",
    //                         "backups",
    //                         "ipv6",
    //                         "metadata",
    //                         "install_agent",
    //                         "storage",
    //                         "image_transfer",
    //                     ],
    //                     "available": true,
    //                     "sizes": [
    //                         "s-1vcpu-1gb",
    //                         "s-1vcpu-2gb",
    //                         "s-1vcpu-3gb",
    //                         "s-2vcpu-2gb",
    //                         "s-3vcpu-1gb",
    //                         "s-2vcpu-4gb",
    //                         "s-4vcpu-8gb",
    //                         "s-6vcpu-16gb",
    //                         "s-8vcpu-32gb",
    //                         "s-12vcpu-48gb",
    //                         "s-16vcpu-64gb",
    //                         "s-20vcpu-96gb",
    //                         "s-24vcpu-128gb",
    //                         "s-32vcpu-192g",
    //                     ],
    //                 },
    //                 "tags": ["web", "env:prod"],
    //                 "vpcUuid": "760e09ef-dc84-11e8-981e-3cfdfeaae000",
    //             }
    //         ]
    //         }
    //         const dropletId = 3929391;
    //         nock(baseUrl)
    //             .get(`/v2/droplets/${dropletId}/neighbors`)
    //             .reply(200, expected);
    //             const resp = await client.v2.droplets.byDroplet_id(dropletId).neighbors.get();
    //             const kiota_processed_data = KiotaHelper.flattenAndUnwrap(resp);
    //             expect(kiota_processed_data).toEqual(expected);
    //     });
    //     it('mocks destroy with  associated resources', async () => {
    //         const expected = {
    //             "reservedIps": [{"id": "6186916", "name": "45.55.96.47", "cost": "4.00"}],
    //             "floatingIps": [{"id": "6186916", "name": "45.55.96.47", "cost": "4.00"}],
    //             "snapshots": [
    //                 {
    //                     "id": "61486916",
    //                     "name": "ubuntu-s-1vcpu-1gb-nyc1-01-1585758823330",
    //                     "cost": "0.05",
    //                 }
    //             ],
    //             "volumes": [
    //                 {
    //                     "id": "ba49449a-7435-11ea-b89e-0a58ac14480f",
    //                     "name": "volume-nyc1-01",
    //                     "cost": "10.00",
    //                 }
    //             ],
    //             "volumeSnapshots": [
    //                 {
    //                     "id": "edb0478d-7436-11ea-86e6-0a58ac144b91",
    //                     "name": "volume-nyc1-01-1585758983629",
    //                     "cost": "0.04",
    //                 }
    //             ],
    //         }
    //         const dropletId = 3164444;
    //         nock(baseUrl)
    //             .get(`/v2/droplets/${dropletId}/destroy_with_associated_resources`)
    //             .reply(200, expected);
    //             const resp = await client.v2.droplets.byDroplet_id(dropletId).destroy_with_associated_resources.get();
    //             const kiota_processed_data = KiotaHelper.flattenAndUnwrap(resp);
    //             expect(kiota_processed_data).toEqual(expected);
    //     });
    //     it('Mocks the droplets selectively destroy with associated resources operation', async () => {
    //         const dropletId = 3164444;
    //         nock(baseUrl)
    //         .delete(`/v2/droplets/${dropletId}/destroy_with_associated_resources/selective`)
    //         .reply(202);
    //         const resp = await client.v2.droplets.byDroplet_id(dropletId).destroy_with_associated_resources.selective.delete;
    //         expect(JSON.stringify(resp)).toBeUndefined(); 
    //     });
    //     it('Mocks the droplets selectively destroy with associated resources dangerous', async () => {
    //         const dropletId = 3164444;
    //         nock(baseUrl)
    //         .delete(`/v2/droplets/${dropletId}/destroy_with_associated_resources/dangerous`)
    //         .reply(202);
    //         const resp = await client.v2.droplets.byDroplet_id(dropletId).destroy_with_associated_resources.dangerous.delete;
    //         expect(JSON.stringify(resp)).toBeUndefined(); 
    //     });
    //     it('mocks the droplets check status of a droplet with associated resources operation', async () => {
    //         const expected = {
    //             droplet: {
    //             id: '187000742',
    //             name: 'ubuntu-s-1vcpu-1gb-nyc1-01',
    //             destroyedAt: '2020-04-01T18:11:49Z',
    //             },
    //             resources: {
    //             reservedIps: [
    //                 {
    //                 id: '6186916',
    //                 name: '45.55.96.47',
    //                 destroyedAt: '2020-04-01T18:11:44Z',
    //                 },
    //             ],
    //             floatingIps: [
    //                 {
    //                 id: '6186916',
    //                 name: '45.55.96.47',
    //                 destroyedAt: '2020-04-01T18:11:44Z',
    //                 },
    //             ],
    //             snapshots: [
    //                 {
    //                 id: '61486916',
    //                 name: 'ubuntu-s-1vcpu-1gb-nyc1-01-1585758823330',
    //                 destroyedAt: '2020-04-01T18:11:44Z',
    //                 },
    //             ],
    //             volumes: [],
    //             volumeSnapshots: [
    //                 {
    //                 id: 'edb0478d-7436-11ea-86e6-0a58ac144b91',
    //                 name: 'volume-nyc1-01-1585758983629',
    //                 destroyedAt: '2020-04-01T18:11:44Z',
    //                 },
    //             ],
    //             },
    //             completedAt: '2020-04-01T18:11:49Z',
    //             failures: 0,
    //         };
    //         const dropletId = 3164444;
    //         nock(baseUrl)
    //             .get(`/v2/droplets/${dropletId}/destroy_with_associated_resources/status`)
    //             .reply(200, expected);
    //         const resp = await client.v2.droplets
    //             .byDroplet_id(dropletId)
    //             .destroy_with_associated_resources.status
    //             .get();
    //         const kiota_processed_data = KiotaHelper.flattenAndUnwrap(resp);
    //         expect(kiota_processed_data).toEqual(expected);
    //     });
    //     it('mocks the droplets retry destroy with associated resources operation', async () => {
    //             const dropletId = 3164444;
    //             nock(baseUrl)
    //                 .post(`/v2/droplets/${dropletId}/destroy_with_associated_resources/retry`)
    //                 .reply(202);
    //             const resp = await client.v2.droplets
    //                 .byDroplet_id(dropletId)
    //                 .destroy_with_associated_resources.retry
    //                 .post();
    //             expect(resp).toBeUndefined();
    //     });
    //     it('mocks the droplets list all neighbors operation', async () => {
    //         const expected = {
    //             neighborIds: [[168671828, 168663509, 168671815], [168671883, 168671750]],
    //         };
    //         nock(baseUrl)
    //             .get('/v2/reports/droplet_neighbors_ids')
    //             .reply(200, expected);
    //         const resp = await client.v2.reports.droplet_neighbors_ids.get();
    //         const kiota_processed_data = KiotaHelper.flattenAndUnwrap(resp);
    //         expect(kiota_processed_data).toEqual(expected);
    //     });
});
