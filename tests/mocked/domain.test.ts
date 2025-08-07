// domains.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { Domain } from "../../src/dots/models/index.js";
import { Domain_record_a } from "../../src/dots/models/index.js";

const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

describe("Domains API", () => {
    afterEach(() => {
        nock.cleanAll();
    });

    it("should create domain", async () => {
        const createReq: Domain = { name: "clienttest.com" };
        const createReqNock = { name: "clienttest.com" };

        const expected = {
            domain: {
                name: "clienttest.com",
                ttl: 1800,
                zone_file: ""
            }
        };

        const typeExpected = {
            domain: {
                name: "clienttest.com",
                ttl: 1800,
                zoneFile: ""
            }
        };

        nock(baseUrl).post("/v2/domains", createReqNock).reply(201, expected);

        const resp = await client.v2.domains.post(createReq);
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should get domain", async () => {
        const domainName = "clienttest.com";
        const expected = {
            domain: {
                name: "clienttest.com",
                ttl: 1800,
                zone_file: `$ORIGIN clienttest.com.\n$TTL 1800\nclienttest.com. IN SOA ns1.digitalocean.com. hostmaster.clienttest.com. 1657812556 10800 3600 604800 1800\nclienttest.com. 1800 IN NS ns1.digitalocean.com. \nclienttest.com. 1800 IN NS ns2.digitalocean.com.\nclienttest.com. 1800 IN NS ns3.digitalocean.com.\n`,
            }
        };

        const typeExpected = {
            domain: {
                name: "clienttest.com",
                ttl: 1800,
                zoneFile: `$ORIGIN clienttest.com.\n$TTL 1800\nclienttest.com. IN SOA ns1.digitalocean.com. hostmaster.clienttest.com. 1657812556 10800 3600 604800 1800\nclienttest.com. 1800 IN NS ns1.digitalocean.com. \nclienttest.com. 1800 IN NS ns2.digitalocean.com.\nclienttest.com. 1800 IN NS ns3.digitalocean.com.\n`,
            }
        };

        nock(baseUrl).get(`/v2/domains/${domainName}`).reply(200, expected);

        const resp = await client.v2.domains.byDomain_name(domainName).get();
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should list domains with pagination", async () => {
        const expected = {
            domains: [
                {
                    name: "clienttest.com",
                    ttl: 1800,
                    zone_file: `$ORIGIN clienttest.com.\n$TTL 1800\nclienttest.com. IN SOA ns1.digitalocean.com. hostmaster.clienttest.com. 1657812556 10800 3600 604800 1800\nclienttest.com. 1800 IN NS ns1.digitalocean.com. \nclienttest.com. 1800 IN NS ns2.digitalocean.com.\nclienttest.com. 1800 IN NS ns3.digitalocean.com.\n`,
                },
            ],
            links: {
                pages: {
                    next: "https://api.digitalocean.com/v2/domains?page=2&per_page=20",
                    last: "https://api.digitalocean.com/v2/domains?page=6&per_page=20",
                }
            },
            meta: { total: 6 },
        };

        const typeExpected = {
            domains: [
                {
                    name: "clienttest.com",
                    ttl: 1800,
                    zoneFile: `$ORIGIN clienttest.com.\n$TTL 1800\nclienttest.com. IN SOA ns1.digitalocean.com. hostmaster.clienttest.com. 1657812556 10800 3600 604800 1800\nclienttest.com. 1800 IN NS ns1.digitalocean.com. \nclienttest.com. 1800 IN NS ns2.digitalocean.com.\nclienttest.com. 1800 IN NS ns3.digitalocean.com.\n`,
                },
            ],
            links: {
                pages: {
                    additionalData: {
                    next: "https://api.digitalocean.com/v2/domains?page=2&per_page=20",
                    last: "https://api.digitalocean.com/v2/domains?page=6&per_page=20",
                    }
                }
            },
            meta: { total: 6 },
        };

        nock(baseUrl)
            .get("/v2/domains")
            .query({ per_page: 20, page: 1 })
            .reply(200, expected);

        const resp = await client.v2.domains.get({
            queryParameters: { perPage: 20, page: 1 }
        });
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should delete domain", async () => {
        const domainName = "testtclient.com";

        nock(baseUrl).delete(`/v2/domains/${domainName}`).reply(204);

        const resp = await client.v2.domains.byDomain_name(domainName).delete();
        expect(resp).toBeUndefined();
    });

    it("should create record", async () => {
        const domainName = "ec.com";
        const createRecordReq : Domain_record_a = {
            type: "A",
            name: "ec.com",
            data: "162.10.66.0",
            priority: undefined,
            port: undefined,
            ttl: 1800,
            weight: undefined,
            flags: undefined,
            tag: undefined,
        };

        const createRecordNock = {
            type: "A",
            name: "ec.com",
            data: "162.10.66.0",
            priority: undefined,
            port: undefined,
            ttl: 1800,
            weight: undefined,
            flags: undefined,
            tag: undefined,
        };        

        const expected = {
            domain_record: {
                id: 324119029,
                type: "A",
                name: "ec.com",
                data: "162.10.66.0",
                priority: null,
                port: null,
                ttl: 1800,
                weight: null,
                flags: null,
                tag: null,
            }
        };

        const typeExpected = {
            domainRecord: {
                id: 324119029,
                type: "A",
                name: "ec.com",
                data: "162.10.66.0",
                priority: undefined,
                port: undefined,
                ttl: 1800,
                weight: undefined,
                flags: undefined,
                tag: undefined,
            }
        };

        nock(baseUrl).post(`/v2/domains/${domainName}/records`, createRecordNock).reply(201, expected);
        const resp = await client.v2.domains.byDomain_name(domainName).records.post(createRecordReq);
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should list domains", async () => {
        const expected = {
            domains: [
                {
                    name: "clienttest.com",
                    ttl: 1800,
                    zone_file: `$ORIGIN clienttest.com.\n$TTL 1800\nclienttest.com. IN SOA ns1.digitalocean.com. hostmaster.clienttest.com. 1657812556 10800 3600 604800 1800\nclienttest.com. 1800 IN NS ns1.digitalocean.com. \nclienttest.com. 1800 IN NS ns2.digitalocean.com.\nclienttest.com. 1800 IN NS ns3.digitalocean.com.\n`,
                },
            ],
            links: {},
            meta: { total: 1 },
        };

        const typeExpected = {
            domains: [
                {
                    name: "clienttest.com",
                    ttl: 1800,
                    zoneFile: `$ORIGIN clienttest.com.\n$TTL 1800\nclienttest.com. IN SOA ns1.digitalocean.com. hostmaster.clienttest.com. 1657812556 10800 3600 604800 1800\nclienttest.com. 1800 IN NS ns1.digitalocean.com. \nclienttest.com. 1800 IN NS ns2.digitalocean.com.\nclienttest.com. 1800 IN NS ns3.digitalocean.com.\n`,
                },
            ],
            links: {},
            meta: { total: 1 },
        };

        nock(baseUrl).get("/v2/domains").reply(200, expected);

        const resp = await client.v2.domains.get();
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should list records", async () => {
        const domainName = "ec.com";
        const expected = {
            domain_records: [
                {
                    id: 324119029,
                    type: "A",
                    name: "ec.com",
                    data: "162.10.66.0",
                    priority: null,
                    port: null,
                    ttl: 1800,
                    weight: null,
                    flags: null,
                    tag: null,
                },
            ],
            links: {},
            meta: { total: 1 },
        };

        const typeExpected = {
            domainRecords: [
                {
                    id: 324119029,
                    type: "A",
                    name: "ec.com",
                    data: "162.10.66.0",
                    priority: undefined,
                    port: undefined,
                    ttl: 1800,
                    weight: undefined,
                    flags: undefined,
                    tag: undefined,
                },
            ],
            links: {},
            meta: { total: 1 },
        };

        nock(baseUrl).get(`/v2/domains/${domainName}/records`).reply(200, expected);

        const resp = await client.v2.domains.byDomain_name(domainName).records.get();
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should list records with pagination", async () => {
        const domainName = "ec.com";
        const expected = {
            domain_records: [
                {
                    id: 324119029,
                    type: "A",
                    name: "ec.com",
                    data: "162.10.66.0",
                    priority: null,
                    port: null,
                    ttl: 1800,
                    weight: null,
                    flags: null,
                    tag: null,
                },
            ],
            links: {
                pages: {
                    next: "https://api.digitalocean.com/v2/domains/ec.com/records?page=2&per_page=20",
                    last: "https://api.digitalocean.com/v2/domains/ec.com/records?page=3&per_page=20",
                }
            },
            meta: { total: 6 },
        };

        const typeExpected = {
            domainRecords: [
                {
                    id: 324119029,
                    type: "A",
                    name: "ec.com",
                    data: "162.10.66.0",
                    priority: undefined,
                    port: undefined,
                    ttl: 1800,
                    weight: undefined,
                    flags: undefined,
                    tag: undefined,
                },
            ],
            links: {
                pages: {
                    additionalData : {
                    next: "https://api.digitalocean.com/v2/domains/ec.com/records?page=2&per_page=20",
                    last: "https://api.digitalocean.com/v2/domains/ec.com/records?page=3&per_page=20",
                    }
                }
            },
            meta: { total: 6 },
        };

        nock(baseUrl)
            .get(`/v2/domains/${domainName}/records`)
            .query({ per_page: 20, page: 1 })
            .reply(200, expected);

        const resp = await client.v2.domains.byDomain_name(domainName).records.get({
            queryParameters: { perPage: 20, page: 1 }
        });
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should get record", async () => {
        const domainName = "ec.com";
        const recordId = 324119029;

        const expected = {
            domain_record: {
                id: 324119029,
                type: "A",
                name: "ec.com",
                data: "162.10.66.0",
                priority: null,
                port: null,
                ttl: 1800,
                weight: null,
                flags: null,
                tag: null,
            },
        };

        const typeExpected = {
            domainRecord: {
                id: 324119029,
                type: "A",
                name: "ec.com",
                data: "162.10.66.0",
                priority: undefined,
                port: undefined,
                ttl: 1800,
                weight: undefined,
                flags: undefined,
                tag: undefined,
            },
        };

        nock(baseUrl).get(`/v2/domains/${domainName}/records/${recordId}`).reply(200, expected);

        const resp = await client.v2.domains.byDomain_name(domainName).records.byDomain_record_id(recordId).get();
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should update record", async () => {
        const domainName = "ec.com";
        const recordId = 324119029;
        const updateReq = { name: "ec.com", type: "A" };
        const updateReqNock = { name: "ec.com", type: "A" };

        const expected = {
            domain_record: {
                id: 324119029,
                type: "A",
                name: "ec.com",
                data: "162.10.66.0",
                priority: null,
                port: null,
                ttl: 1800,
                weight: null,
                flags: null,
                tag: null,
            },
        };

        const typeExpected = {
            domainRecord: {
                id: 324119029,
                type: "A",
                name: "ec.com",
                data: "162.10.66.0",
                priority: undefined,
                port: undefined,
                ttl: 1800,
                weight: undefined,
                flags: undefined,
                tag: undefined,
            },
        };

        nock(baseUrl).put(`/v2/domains/${domainName}/records/${recordId}`, updateReqNock).reply(200, expected);

        const resp = await client.v2.domains.byDomain_name(domainName).records.byDomain_record_id(recordId).put(updateReq);
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should patch record", async () => {
        const domainName = "ec.com";
        const recordId = 324119029;
        const patchReq = { name: "ec.com", type: "A" };
        const patchReqNock = { name: "ec.com", type: "A" };

        const expected = {
            domain_record: {
                id: 324119029,
                type: "A",
                name: "ec.com",
                data: "162.10.66.0",
                priority: null,
                port: null,
                ttl: 1800,
                weight: null,
                flags: null,
                tag: null,
            },
        };

        const typeExpected = {
            domainRecord: {
                id: 324119029,
                type: "A",
                name: "ec.com",
                data: "162.10.66.0",
                priority: undefined,
                port: undefined,
                ttl: 1800,
                weight: undefined,
                flags: undefined,
                tag: undefined,
            },
        };

        nock(baseUrl).patch(`/v2/domains/${domainName}/records/${recordId}`, patchReqNock).reply(200, expected);

        const resp = await client.v2.domains.byDomain_name(domainName).records.byDomain_record_id(recordId).patch(patchReq);
        expect(resp).toStrictEqual(typeExpected);
    });

    it("should delete record", async () => {
        const domainName = "ec.com";
        const recordId = 324119029;

        nock(baseUrl).delete(`/v2/domains/${domainName}/records/${recordId}`).reply(204);

        const resp = await client.v2.domains.byDomain_name(domainName).records.byDomain_record_id(recordId).delete();
        expect(resp).toBeUndefined();
    });
});