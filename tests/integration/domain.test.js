import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();
const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}
const PREFIX = "test";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Domain Integration Tests", () => {
    it("should create record", async () => {
        const name = `${PREFIX}${uuidv4()}.com`;
        const createDomainReq = { name };
        const domain = await createDomain(createDomainReq);
        try {
            const listResp = await client.v2.domains.get();
            if (!listResp || !listResp.domains) {
                throw new Error("Failed to list domains");
            }
            expect(listResp.domains.length).toBeGreaterThan(0);
            // Get the specific domain
            const getResp = await client.v2.domains.byDomain_name(domain.name).get();
            if (!getResp || !getResp.domain) {
                throw new Error("Failed to get domain");
            }
            expect(getResp.domain.name).toBe(name);
            const createRecordReq = {
                type: "A",
                name: name,
                data: "162.10.66.0",
                priority: undefined,
                port: undefined,
                ttl: 1800,
                weight: undefined,
                flags: undefined,
                tag: undefined,
            };
            const record = await createDomainRecord(domain.name, createRecordReq);
            try {
                const listRecordsResp = await client.v2.domains.byDomain_name(domain.name).records.get();
                if (!listRecordsResp || !listRecordsResp.domainRecords) {
                    throw new Error("Failed to list domain records");
                }
                expect(listRecordsResp.domainRecords.length).toBeGreaterThan(0);
                const getRecordResp = await client.v2.domains.byDomain_name(domain.name).records.byDomain_record_id(record.id).get();
                if (!getRecordResp || !getRecordResp.domainRecord) {
                    throw new Error("Failed to get domain record");
                }
                expect(getRecordResp.domainRecord.id).toBe(record.id);
                const newTtl = 900;
                const patchRequest = { type: "A", ttl: newTtl };
                const patchResp = await client.v2.domains.byDomain_name(domain.name).records.byDomain_record_id(record.id).patch(patchRequest);
                if (!patchResp || !patchResp.domainRecord) {
                    throw new Error("Failed to patch domain record");
                }
                expect(patchResp.domainRecord.ttl).toBe(newTtl);
                const updateTtl = 1000;
                const updateRequest = { type: "A", ttl: updateTtl };
                const updateResp = await client.v2.domains.byDomain_name(domain.name).records.byDomain_record_id(record.id).put(updateRequest);
                if (!updateResp || !updateResp.domainRecord) {
                    throw new Error("Failed to update domain record");
                }
                expect(updateResp.domainRecord.ttl).toBe(updateTtl);
            }
            finally {
                await deleteDomainRecord(domain.name, record.id);
            }
        }
        finally {
            await deleteDomain(domain.name);
        }
    });
    async function createDomain(req) {
        console.log(`Creating domain using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.domains.post(req);
            if (resp && resp.domain) {
                const domain = resp.domain;
                console.log(`Created domain ${domain.name}`);
                return {
                    name: domain.name,
                    ttl: domain.ttl,
                    zoneFile: domain.zoneFile,
                };
            }
            else {
                throw new Error("Failed to create domain or domain is undefined");
            }
        }
        catch (err) {
            if (err instanceof Error && 'statusCode' in err) {
                const httpError = err;
                throw new Error(`Error: ${httpError.statusCode} ${httpError.message}: ${httpError.response?.bodyAsText}`);
            }
            else {
                throw err;
            }
        }
    }
    async function createDomainRecord(domainName, req) {
        console.log(`Creating domain record for ${domainName} using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.domains.byDomain_name(domainName).records.post(req);
            if (resp && resp.domainRecord) {
                const record = resp.domainRecord;
                console.log(`Created domain record ${record.id} for ${domainName}`);
                return {
                    id: record.id,
                    type: record.type,
                    name: record.name,
                    data: record.data,
                    priority: record.priority,
                    port: record.port,
                    ttl: record.ttl,
                    weight: record.weight,
                    flags: record.flags,
                    tag: record.tag,
                };
            }
            else {
                throw new Error("Failed to create domain record or record is undefined");
            }
        }
        catch (err) {
            if (err instanceof Error && 'statusCode' in err) {
                const httpError = err;
                throw new Error(`Error: ${httpError.statusCode} ${httpError.message}: ${httpError.response?.bodyAsText}`);
            }
            else {
                throw err;
            }
        }
    }
    async function deleteDomain(domainName) {
        console.log(`Deleting domain ${domainName}`);
        try {
            await client.v2.domains.byDomain_name(domainName).delete();
            console.log(`Deleted domain ${domainName}`);
        }
        catch (err) {
            console.error(`Failed to delete domain ${domainName}:`, err);
        }
    }
    async function deleteDomainRecord(domainName, recordId) {
        console.log(`Deleting domain record ${recordId} for ${domainName}`);
        try {
            await client.v2.domains.byDomain_name(domainName).records.byDomain_record_id(recordId).delete();
            console.log(`Deleted domain record ${recordId} for ${domainName}`);
        }
        catch (err) {
            console.error(`Failed to delete domain record ${recordId} for ${domainName}:`, err);
        }
    }
});
