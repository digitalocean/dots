// container-registry.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Container Registry API", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should create a container registry", async () => {
        const createReq = {
            name: "example",
            subscriptionTierSlug: "basic",
            region: "fra1"
        };
        const createReqNock = {
            name: "example",
            subscription_tier_slug: "basic",
            region: "fra1"
        };
        const expected = {
            registry: {
                name: "example",
                created_at: "2020-03-21T16:02:37Z",
                region: "fra1",
                storage_usage_bytes: 29393920,
                storage_usage_bytes_updated_at: "2020-11-04T21:39:49.530562231Z",
                subscription: {
                    tier: {
                        name: "Basic",
                        slug: "basic",
                        included_repositories: 5,
                        included_storage_bytes: 5368709120,
                        allow_storage_overage: true,
                        included_bandwidth_bytes: 5368709120,
                        monthly_price_in_cents: 500,
                        storage_overage_price_in_cents: 2,
                    },
                    created_at: "2020-01-23T21:19:12Z",
                    updated_at: "2020-11-05T15:53:24Z",
                },
            }
        };
        const typeExpected = {
            registry: {
                name: "example",
                createdAt: new Date("2020-03-21T16:02:37Z"),
                region: "fra1",
                storageUsageBytes: 29393920,
                storageUsageBytesUpdatedAt: new Date("2020-11-04T21:39:49.530562231Z"),
                subscription: {
                    tier: {
                        name: "Basic",
                        slug: "basic",
                        includedRepositories: 5,
                        includedStorageBytes: 5368709120,
                        allowStorageOverage: true,
                        includedBandwidthBytes: 5368709120,
                        monthlyPriceInCents: 500,
                        storageOveragePriceInCents: 2,
                    },
                    createdAt: new Date("2020-01-23T21:19:12Z"),
                    updatedAt: new Date("2020-11-05T15:53:24Z"),
                },
            }
        };
        nock(baseUrl).post("/v2/registry", createReqNock).reply(201, expected);
        const resp = await client.v2.registry.post(createReq);
        expect(resp).toEqual(typeExpected);
    });
    it("should get a container registry", async () => {
        const expected = {
            registry: {
                name: "example",
                created_at: "2020-03-21T16:02:37Z",
                region: "fra1",
                storage_usage_bytes: 29393920,
                storage_usage_bytes_updated_at: "2020-11-04T21:39:49.530562231Z",
                subscription: {
                    tier: {
                        name: "Basic",
                        slug: "basic",
                        included_repositories: 5,
                        included_storage_bytes: 5368709120,
                        allow_storage_overage: true,
                        included_bandwidth_bytes: 5368709120,
                        monthly_price_in_cents: 500,
                        storage_overage_price_in_cents: 2,
                    },
                    created_at: "2020-01-23T21:19:12Z",
                    updated_at: "2020-11-05T15:53:24Z",
                },
            }
        };
        const typeExpected = {
            registry: {
                name: "example",
                createdAt: new Date("2020-03-21T16:02:37Z"),
                region: "fra1",
                storageUsageBytes: 29393920,
                storageUsageBytesUpdatedAt: new Date("2020-11-04T21:39:49.530562231Z"),
                subscription: {
                    tier: {
                        name: "Basic",
                        slug: "basic",
                        includedRepositories: 5,
                        includedStorageBytes: 5368709120,
                        allowStorageOverage: true,
                        includedBandwidthBytes: 5368709120,
                        monthlyPriceInCents: 500,
                        storageOveragePriceInCents: 2,
                    },
                    createdAt: new Date("2020-01-23T21:19:12Z"),
                    updatedAt: new Date("2020-11-05T15:53:24Z"),
                },
            }
        };
        nock(baseUrl).get("/v2/registry").reply(200, expected);
        const resp = await client.v2.registry.get();
        expect(resp).toEqual(typeExpected);
    });
    it("should delete a container registry", async () => {
        nock(baseUrl).delete("/v2/registry").reply(204);
        const resp = await client.v2.registry.delete();
        expect(resp).toBeUndefined();
    });
    it("should get subscription information", async () => {
        const expected = {
            subscription: {
                tier: {
                    name: "Basic",
                    slug: "basic",
                    included_repositories: 5,
                    included_storage_bytes: 5368709120,
                    allow_storage_overage: true,
                    included_bandwidth_bytes: 5368709120,
                    monthly_price_in_cents: 500,
                    storage_overage_price_in_cents: 2,
                },
                created_at: "2020-01-23T21:19:12Z",
                updated_at: "2020-11-05T15:53:24Z",
            }
        };
        const typeExpected = {
            subscription: {
                tier: {
                    name: "Basic",
                    slug: "basic",
                    includedRepositories: 5,
                    includedStorageBytes: 5368709120,
                    allowStorageOverage: true,
                    includedBandwidthBytes: 5368709120,
                    monthlyPriceInCents: 500,
                    storageOveragePriceInCents: 2,
                },
                createdAt: new Date("2020-01-23T21:19:12Z"),
                updatedAt: new Date("2020-11-05T15:53:24Z"),
            }
        };
        nock(baseUrl).get("/v2/registry/subscription").reply(200, expected);
        const resp = await client.v2.registry.subscription.get();
        expect(resp).toEqual(typeExpected);
    });
    it("should update subscription", async () => {
        const updateReq = { tierSlug: "basic" };
        const updateReqNock = { tier_slug: "basic" };
        const expected = {
            subscription: {
                tier: {
                    name: "Basic",
                    slug: "basic",
                    included_repositories: 5,
                    included_storage_bytes: 5368709120,
                    allow_storage_overage: true,
                    included_bandwidth_bytes: 5368709120,
                    monthly_price_in_cents: 500,
                    storage_overage_price_in_cents: 2,
                },
                created_at: "2020-01-23T21:19:12Z",
                updated_at: "2020-11-05T15:53:24Z",
            }
        };
        const typeExpected = {
            subscription: {
                tier: {
                    name: "Basic",
                    slug: "basic",
                    includedRepositories: 5,
                    includedStorageBytes: 5368709120,
                    allowStorageOverage: true,
                    includedBandwidthBytes: 5368709120,
                    monthlyPriceInCents: 500,
                    storageOveragePriceInCents: 2,
                },
                createdAt: new Date("2020-01-23T21:19:12Z"),
                updatedAt: new Date("2020-11-05T15:53:24Z"),
            }
        };
        nock(baseUrl).post("/v2/registry/subscription", updateReqNock).reply(200, expected);
        const resp = await client.v2.registry.subscription.post(updateReq);
        expect(resp).toEqual(typeExpected);
    });
    it("should get docker credentials", async () => {
        const expected = {
            auths: {
                "registry.digitalocean.com": { auth: "YjdkMDNhNjk0N2IyMZDM1MDQ1ODIK" }
            }
        };
        const typeExpected = {
            auths: {
                "registryDigitaloceanCom": { auth: "YjdkMDNhNjk0N2IyMZDM1MDQ1ODIK" }
            }
        };
        nock(baseUrl).get("/v2/registry/docker-credentials").reply(200, expected);
        const resp = await client.v2.registry.dockerCredentials.get();
        expect(resp).toEqual(typeExpected);
    });
    it("should validate registry name", async () => {
        const validateReq = { name: "example" };
        nock(baseUrl).post("/v2/registry/validate-name", validateReq).reply(204);
        const resp = await client.v2.registry.validateName.post(validateReq);
        expect(resp).toBeUndefined();
    });
    it("should list repositories", async () => {
        const registryName = "example";
        const expected = {
            repositories: [
                {
                    registry_name: "example",
                    name: "repo-1",
                    tag_count: 57,
                    manifest_count: 82,
                    latest_manifest: {
                        digest: "sha256:cb8a924afdf0229ef7515d9e5b3024e23b3eb03ddbba287f4a19c6ac90b8d221",
                        registry_name: "example",
                        repository: "repo-1",
                        compressed_size_bytes: 1972332,
                        size_bytes: 2816445,
                        updated_at: "2021-04-09T23:54:25Z",
                        tags: ["v1", "v2"],
                        blobs: [
                            {
                                digest: "sha256:14119a10abf4669e8cdbdff324a9f9605d99697215a0d21c360fe8dfa8471bab",
                                compressed_size_bytes: 1471,
                            },
                            {
                                digest: "sha256:a0d0a0d46f8b52473982a3c466318f479767577551a53ffc9074c9fa7035982e",
                            },
                            {
                                digest: "sha256:69704ef328d05a9f806b6b8502915e6a0a4faa4d72018dc42343f511490daf8a",
                                compressed_size_bytes: 528,
                            },
                        ],
                    },
                }
            ],
            meta: { total: 5 },
            links: {
                pages: {
                    next: "https://api.digitalocean.com/v2/registry/example/repositoriesV2?page=2&page_token=JPZmZzZXQiOjB9&per_page=1",
                    last: "https://api.digitalocean.com/v2/registry/example/repositoriesV2?page=5&per_page=1",
                }
            },
        };
        const typeExpected = {
            repositories: [
                {
                    registryName: "example",
                    name: "repo-1",
                    tagCount: 57,
                    manifestCount: 82,
                    latestManifest: {
                        digest: "sha256:cb8a924afdf0229ef7515d9e5b3024e23b3eb03ddbba287f4a19c6ac90b8d221",
                        registryName: "example",
                        repository: "repo-1",
                        compressedSizeBytes: 1972332,
                        sizeBytes: 2816445,
                        updatedAt: new Date("2021-04-09T23:54:25Z"),
                        tags: ["v1", "v2"],
                        blobs: [
                            {
                                digest: "sha256:14119a10abf4669e8cdbdff324a9f9605d99697215a0d21c360fe8dfa8471bab",
                                compressedSizeBytes: 1471,
                            },
                            {
                                digest: "sha256:a0d0a0d46f8b52473982a3c466318f479767577551a53ffc9074c9fa7035982e",
                            },
                            {
                                digest: "sha256:69704ef328d05a9f806b6b8502915e6a0a4faa4d72018dc42343f511490daf8a",
                                compressedSizeBytes: 528,
                            },
                        ],
                    },
                }
            ],
            meta: { total: 5 },
            links: {
                pages: {
                    additionalData: {
                        next: "https://api.digitalocean.com/v2/registry/example/repositoriesV2?page=2&page_token=JPZmZzZXQiOjB9&per_page=1",
                        last: "https://api.digitalocean.com/v2/registry/example/repositoriesV2?page=5&per_page=1",
                    }
                }
            },
        };
        nock(baseUrl).get(`/v2/registry/${registryName}/repositoriesV2`).reply(200, expected);
        const resp = await client.v2.registry.byRegistry_name(registryName).repositoriesV2.get();
        expect(resp).toEqual(typeExpected);
    });
    it("should list repository tags", async () => {
        const registryName = "example";
        const repositoryName = "repo-1";
        const expected = {
            tags: [
                {
                    registry_name: "example",
                    repository: "repo-1",
                    tag: "latest",
                    manifest_digest: "sha256:cb8a924afdf0229ef7515d9e5b3024e23b3eb03ddbba287f4a19c6ac90b8d221",
                    compressed_size_bytes: 2803255,
                    size_bytes: 5861888,
                    updated_at: "2020-04-09T23:54:25Z",
                }
            ],
            meta: { total: 1 },
        };
        const typeExpected = {
            tags: [
                {
                    registryName: "example",
                    repository: "repo-1",
                    tag: "latest",
                    manifestDigest: "sha256:cb8a924afdf0229ef7515d9e5b3024e23b3eb03ddbba287f4a19c6ac90b8d221",
                    compressedSizeBytes: 2803255,
                    sizeBytes: 5861888,
                    updatedAt: new Date("2020-04-09T23:54:25Z"),
                }
            ],
            meta: { total: 1 },
        };
        nock(baseUrl).get(`/v2/registry/${registryName}/repositories/${repositoryName}/tags`).reply(200, expected);
        const resp = await client.v2.registry.byRegistry_name(registryName).repositories.byRepository_name(repositoryName).tags.get();
        expect(resp).toEqual(typeExpected);
    });
    it("should delete repository tag", async () => {
        const registryName = "example";
        const repositoryName = "repo-1";
        const repositoryTag = "tag1";
        nock(baseUrl).delete(`/v2/registry/${registryName}/repositories/${repositoryName}/tags/${repositoryTag}`).reply(204);
        const resp = await client.v2.registry.byRegistry_name(registryName).repositories.byRepository_name(repositoryName).tags.byRepository_tag(repositoryTag).delete();
        expect(resp).toBeUndefined();
    });
    it("should start garbage collection", async () => {
        const registryName = "example";
        const payLoadNock = {
            type: "unreferenced blobs only",
        };
        const expected = {
            garbage_collection: {
                uuid: "eff0feee-49c7-4e8f-ba5c-a320c109c8a8",
                registry_name: "example",
                status: "requested",
                created_at: "2020-10-30T21:03:24Z",
                updated_at: "2020-10-30T21:03:44Z",
                blobs_deleted: 42,
                freed_bytes: 667,
            },
        };
        const typeExpected = {
            garbageCollection: {
                uuid: "eff0feee-49c7-4e8f-ba5c-a320c109c8a8",
                registryName: "example",
                status: "requested",
                createdAt: new Date("2020-10-30T21:03:24Z"),
                updatedAt: new Date("2020-10-30T21:03:44Z"),
                blobsDeleted: 42,
                freedBytes: 667,
            },
        };
        nock(baseUrl).post(`/v2/registry/${registryName}/garbage-collection`, payLoadNock).reply(201, expected);
        const payLoad = {
            type: "unreferenced blobs only",
        };
        const resp = await client.v2.registry.byRegistry_name(registryName).garbageCollection.post(payLoad);
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should list garbage collections", async () => {
        const registryName = "example";
        const expected = {
            garbage_collections: [
                {
                    uuid: "eff0feee-49c7-4e8f-ba5c-a320c109c8a8",
                    registry_name: "example",
                    status: "requested",
                    created_at: "2020-10-30T21:03:24.000Z",
                    updated_at: "2020-10-30T21:03:44.000Z",
                    blobs_deleted: 42,
                    freed_bytes: 667,
                }
            ],
            meta: { total: 1 },
        };
        const typeExpected = {
            garbageCollections: [
                {
                    uuid: "eff0feee-49c7-4e8f-ba5c-a320c109c8a8",
                    registryName: "example",
                    status: "requested",
                    createdAt: new Date("2020-10-30T21:03:24.000Z"),
                    updatedAt: new Date("2020-10-30T21:03:44.000Z"),
                    blobsDeleted: 42,
                    freedBytes: 667,
                }
            ],
            additionalData: {
                meta: { total: 1 },
            }
        };
        nock(baseUrl).get(`/v2/registry/${registryName}/garbage-collections`).reply(200, expected);
        const resp = await client.v2.registry.byRegistry_name(registryName).garbageCollections.get();
        expect(resp).toEqual(typeExpected);
    });
    it("should get registry options", async () => {
        const expected = {
            options: {
                available_regions: ["nyc3", "sfo3", "ams3", "sgp1", "fra1"],
                subscription_tiers: [
                    {
                        name: "Starter",
                        slug: "starter",
                        included_repositories: 1,
                        included_storage_bytes: 524288000,
                        allow_storage_overage: false,
                        included_bandwidth_bytes: 524288000,
                        monthly_price_in_cents: 0,
                        eligible: false,
                        eligibility_reasons: ["OverRepositoryLimit"],
                    },
                    {
                        name: "Basic",
                        slug: "basic",
                        included_repositories: 5,
                        included_storage_bytes: 5368709120,
                        allow_storage_overage: true,
                        included_bandwidth_bytes: 5368709120,
                        monthly_price_in_cents: 500,
                        eligible: true,
                    },
                ],
            }
        };
        const typeExpected = {
            options: {
                availableRegions: ["nyc3", "sfo3", "ams3", "sgp1", "fra1"],
                subscriptionTiers: [
                    {
                        name: "Starter",
                        slug: "starter",
                        includedRepositories: 1,
                        includedStorageBytes: 524288000,
                        allowStorageOverage: false,
                        includedBandwidthBytes: 524288000,
                        monthlyPriceInCents: 0,
                        eligible: false,
                        eligibilityReasons: ["OverRepositoryLimit"],
                    },
                    {
                        name: "Basic",
                        slug: "basic",
                        includedRepositories: 5,
                        includedStorageBytes: 5368709120,
                        allowStorageOverage: true,
                        includedBandwidthBytes: 5368709120,
                        monthlyPriceInCents: 500,
                        eligible: true,
                    },
                ],
            }
        };
        nock(baseUrl).get("/v2/registry/options").reply(200, expected);
        const resp = await client.v2.registry.optionsPath.get();
        expect(resp).toEqual(typeExpected);
    });
});
