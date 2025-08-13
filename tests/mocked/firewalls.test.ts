// firewalls.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { Firewall } from "../../src/dots/models/index.js";
import { Firewall_rules } from "../../src/dots/models/index.js";
import { DropletsPostRequestBody, DropletsDeleteRequestBody } from "../../src/dots/v2/firewalls/item/droplets/index.js";
import { TagsPostRequestBody, TagsDeleteRequestBody } from "../../src/dots/v2/firewalls/item/tags/index.js";


const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

describe("Firewalls API", () => {
    afterEach(() => {
        nock.cleanAll();
    });

    it("should list firewalls", async () => {
        const expected = {
            firewalls: [
                {
                    id: "e8721de7-ebd9-46ff-8b8d-f6cd14b2769b",
                    name: "public-access",
                    status: "succeeded",
                    inbound_rules: [],
                    outbound_rules: [
                        {
                            protocol: "icmp",
                            ports: "0",
                            destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                        },
                        {
                            protocol: "tcp",
                            ports: "0",
                            destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                        },
                        {
                            protocol: "udp",
                            ports: "0",
                            destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                        },
                    ],
                    created_at: "2021-10-11T19:04:13Z",
                    droplet_ids: [],
                    tags: ["public-access"],
                    pending_changes: [],
                },
                {
                    id: "fb6045f1-cf1d-4ca3-bfac-18832663025b",
                    name: "firewall",
                    status: "succeeded",
                    inbound_rules: [
                        {
                            protocol: "tcp",
                            ports: "80",
                            sources: {
                                load_balancer_uids: [
                                    "4de7ac8b-495b-4884-9a69-1050c6793cd6"
                                ]
                            },
                        },
                        {
                            protocol: "tcp",
                            ports: "22",
                            sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                        },
                    ],
                    created_at: "2017-05-23T21:23:59Z",
                    droplet_ids: [123456],
                    tags: [],
                    pending_changes: [],
                },
            ],
            links: {},
            meta: { total: 2 },
        };

        const typeExpected = {
            firewalls: [
                {
                    id: "e8721de7-ebd9-46ff-8b8d-f6cd14b2769b",
                    name: "public-access",
                    status: "succeeded",
                    inboundRules: [],
                    outboundRules: [
                        {
                            protocol: "icmp",
                            ports: "0",
                            destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                        },
                        {
                            protocol: "tcp",
                            ports: "0",
                            destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                        },
                        {
                            protocol: "udp",
                            ports: "0",
                            destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                        },
                    ],
                    createdAt: new Date("2021-10-11T19:04:13Z"),
                    dropletIds: [],
                    tags: ["public-access"],
                    pendingChanges: [],
                },
                {
                    id: "fb6045f1-cf1d-4ca3-bfac-18832663025b",
                    name: "firewall",
                    status: "succeeded",
                    inboundRules: [
                        {
                            protocol: "tcp",
                            ports: "80",
                            sources: {
                                loadBalancerUids: [
                                    "4de7ac8b-495b-4884-9a69-1050c6793cd6"
                                ]
                            },
                        },
                        {
                            protocol: "tcp",
                            ports: "22",
                            sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                        },
                    ],
                    createdAt: new Date("2017-05-23T21:23:59Z"),
                    dropletIds: [123456],
                    tags: [],
                    pendingChanges: [],
                },
            ],
            links: {},
            meta: { total: 2 },
        };

        nock(baseUrl).get("/v2/firewalls").reply(200, expected);

        const resp = await client.v2.firewalls.get();
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should get firewall", async () => {
        const firewallId = "fb6045f1-cf1d-4ca3-bfac-18832663025b";
        const expected = {
            firewall: {
                id: "fb6045f1-cf1d-4ca3-bfac-18832663025b",
                name: "firewall",
                status: "succeeded",
                inbound_rules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        sources: {
                            load_balancer_uids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                        },
                    },
                    {
                        protocol: "tcp",
                        ports: "22",
                        sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                    },
                ],
                created_at: "2017-05-23T21:23:59Z",
                droplet_ids: [123456],
                tags: [],
                pending_changes: [],
            }
        };

        const typeExpected = {
            firewall: {
                id: "fb6045f1-cf1d-4ca3-bfac-18832663025b",
                name: "firewall",
                status: "succeeded",
                inboundRules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        sources: {
                            loadBalancerUids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                        },
                    },
                    {
                        protocol: "tcp",
                        ports: "22",
                        sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                    },
                ],
                createdAt: new Date("2017-05-23T21:23:59Z"),
                dropletIds: [123456],
                tags: [],
                pendingChanges: [],
            }
        };

        nock(baseUrl).get(`/v2/firewalls/${firewallId}`).reply(200, expected);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).get();
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should create firewall", async () => {
        const createReq: Firewall = {
            name: "firewall",
            inboundRules: [
                {
                    protocol: "tcp",
                    ports: "80",
                    sources: {
                        loadBalancerUids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                    },
                },
                {
                    protocol: "tcp",
                    ports: "22",
                    sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                },
            ],
            outboundRules: [
                {
                    protocol: "tcp",
                    ports: "80",
                    destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                }
            ],
            dropletIds: [8043964],
        };

        const createReqNock = {
            name: "firewall",
            inbound_rules: [
                {
                    protocol: "tcp",
                    ports: "80",
                    sources: {
                        load_balancer_uids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                    },
                },
                {
                    protocol: "tcp",
                    ports: "22",
                    sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                },
            ],
            outbound_rules: [
                {
                    protocol: "tcp",
                    ports: "80",
                    destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                }
            ],
            droplet_ids: [8043964],
        };

        const expected = {
            firewall: {
                id: "bb4b2611-3d72-467b-8602-280330ecd65c",
                name: "firewall",
                status: "waiting",
                inbound_rules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        sources: {
                            load_balancer_uids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                        },
                    },
                    {
                        protocol: "tcp",
                        ports: "22",
                        sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                    },
                ],
                outbound_rules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                    }
                ],
                created_at: "2017-05-23T21:24:00Z",
                droplet_ids: [8043964],
                tags: [],
                pending_changes: [
                    { droplet_id: 8043964, removing: false, status: "waiting" }
                ],
            }
        };

        const typeExpected = {
            firewall: {
                id: "bb4b2611-3d72-467b-8602-280330ecd65c",
                name: "firewall",
                status: "waiting",
                inboundRules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        sources: {
                            loadBalancerUids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                        },
                    },
                    {
                        protocol: "tcp",
                        ports: "22",
                        sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                    },
                ],
                outboundRules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                    }
                ],
                createdAt: new Date("2017-05-23T21:24:00Z"),
                dropletIds: [8043964],
                tags: [],
                pendingChanges: [
                    { dropletId: 8043964, removing: false, status: "waiting" }
                ],
            }
        };

        nock(baseUrl).post("/v2/firewalls", createReqNock).reply(202, expected);

        const resp = await client.v2.firewalls.post(createReq);
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should update firewall", async () => {
        const firewallId = "bb4b2611-3d72-467b-8602-280330ecd65c";
        const updateReq: Firewall = {
            name: "frontend-firewall",
            inboundRules: [
                {
                    protocol: "tcp",
                    ports: "8080",
                    sources: {
                        loadBalancerUids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                    },
                },
                {
                    protocol: "tcp",
                    ports: "22",
                    sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                },
            ],
            outboundRules: [
                {
                    protocol: "tcp",
                    ports: "8080",
                    destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                }
            ],
            dropletIds: [8043964],
            tags: ["frontend"],
        };

        const updateReqNock = {
            name: "frontend-firewall",
            inbound_rules: [
                {
                    protocol: "tcp",
                    ports: "8080",
                    sources: {
                        load_balancer_uids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                    },
                },
                {
                    protocol: "tcp",
                    ports: "22",
                    sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                },
            ],
            outbound_rules: [
                {
                    protocol: "tcp",
                    ports: "8080",
                    destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                }
            ],
            droplet_ids: [8043964],
            tags: ["frontend"],
        };

        const expected = {
            firewall: {
                id: "bb4b2611-3d72-467b-8602-280330ecd65c",
                name: "frontend-firewall",
                inbound_rules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        sources: {
                            load_balancer_uids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                        },
                    },
                    {
                        protocol: "tcp",
                        ports: "22",
                        sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                    },
                ],
                outbound_rules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                    }
                ],
                created_at: "2020-05-23T21:24:00Z",
                droplet_ids: [8043964],
                tags: ["frontend"],
                status: "waiting",
                pending_changes: [
                    { droplet_id: 8043964, removing: false, status: "waiting" }
                ],
            }
        };

        const typeExpected = {
            firewall: {
                id: "bb4b2611-3d72-467b-8602-280330ecd65c",
                name: "frontend-firewall",
                inboundRules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        sources: {
                            loadBalancerUids: ["4de7ac8b-495b-4884-9a69-1050c6793cd6"]
                        },
                    },
                    {
                        protocol: "tcp",
                        ports: "22",
                        sources: { tags: ["gateway"], addresses: ["18.0.0.0/8"] },
                    },
                ],
                outboundRules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                    }
                ],
                createdAt: new Date("2020-05-23T21:24:00Z"),
                dropletIds: [8043964],
                tags: ["frontend"],
                status: "waiting",
                pendingChanges: [
                    { dropletId: 8043964, removing: false, status: "waiting" }
                ],
            }
        };

        nock(baseUrl).put(`/v2/firewalls/${firewallId}`, updateReqNock).reply(200, expected);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).put(updateReq);
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should delete firewall", async () => {
        const firewallId = "aaa-bbb-111-ccc-222";

        nock(baseUrl).delete(`/v2/firewalls/${firewallId}`).reply(204);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).delete();
        expect(resp).toBeUndefined();
    });

    it("should assign droplets", async () => {
        const firewallId = "aaa-bbb-111-ccc-222";
        const assignReq : DropletsPostRequestBody= { dropletIds : [1234, 5678] };
        const assignReqNock = { droplet_ids: [1234, 5678] };

        nock(baseUrl).post(`/v2/firewalls/${firewallId}/droplets`, assignReqNock).reply(204);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).droplets.post(assignReq)
        expect(resp).toBeUndefined();
    });

    it("should delete droplets", async () => {
        const firewallId = "aaa-bbb-111-ccc-222";
        const removeReq: DropletsDeleteRequestBody  = { dropletIds: [1234, 5678] };
        const removeReqNock = { droplet_ids: [1234, 5678] };

        nock(baseUrl).delete(`/v2/firewalls/${firewallId}/droplets`, removeReqNock).reply(204);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).droplets.delete(removeReq);
        expect(resp).toBeUndefined();
    });

    it("should add tags", async () => {
        const firewallId = "aaa-bbb-111-ccc-222";
        const addTagsReq: TagsPostRequestBody = { tags: ["frontend"] };
        const addTagsReqNock = { tags: ["frontend"] };

        nock(baseUrl).post(`/v2/firewalls/${firewallId}/tags`, addTagsReqNock).reply(204);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).tags.post(addTagsReq);
        expect(resp).toBeUndefined();
    });

    it("should delete tags", async () => {
        const firewallId = "aaa-bbb-111-ccc-222";
        const removeTagsReq: TagsDeleteRequestBody = { tags: ["frontend"] };
        const removeTagsReqNock = { tags: ["frontend"] };

        nock(baseUrl).delete(`/v2/firewalls/${firewallId}/tags`, removeTagsReqNock).reply(204);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).tags.delete(removeTagsReq);
        expect(resp).toBeUndefined();
    });

    it("should add rules", async () => {
        const firewallId = "aaa-bbb-111-ccc-222";
        const addRulesReq: Firewall_rules = {
            inboundRules: [
                { protocol: "tcp", ports: "3306", sources: { dropletIds: [49696269] } }
            ],
            outboundRules: [
                {
                    protocol: "tcp",
                    ports: "3306",
                    destinations: { dropletIds: [49696269] },
                }
            ],
        };

        const addRulesReqNock = {
            inbound_rules: [
                { protocol: "tcp", ports: "3306", sources: { droplet_ids: [49696269] } }
            ],
            outbound_rules: [
                {
                    protocol: "tcp",
                    ports: "3306",
                    destinations: { droplet_ids: [49696269] },
                }
            ],
        };

        nock(baseUrl).post(`/v2/firewalls/${firewallId}/rules`, addRulesReqNock).reply(204);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).rules.post(addRulesReq);
        expect(resp).toBeUndefined();
    });

    it("should delete rules", async () => {
        const firewallId = "aaa-bbb-111-ccc-222";
        const deleteRulesReq: Firewall_rules = {
            inboundRules: [
                { protocol: "tcp", ports: "3306", sources: { dropletIds: [49696269] } }
            ],
            outboundRules: [
                {
                    protocol: "tcp",
                    ports: "3306",
                    destinations: { dropletIds: [49696269] },
                }
            ],
        };

        const deleteRulesReqNock = {
            inbound_rules: [
                { protocol: "tcp", ports: "3306", sources: { droplet_ids: [49696269] } }
            ],
            outbound_rules: [
                {
                    protocol: "tcp",
                    ports: "3306",
                    destinations: { droplet_ids: [49696269] },
                }
            ],
        };

        nock(baseUrl).delete(`/v2/firewalls/${firewallId}/rules`, deleteRulesReqNock).reply(204);

        const resp = await client.v2.firewalls.byFirewall_id(firewallId).rules.delete(deleteRulesReq);
        expect(resp).toBeUndefined();
    });
});