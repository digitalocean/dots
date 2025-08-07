import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { Cdn_endpoint } from "../../src/dots/models/index.js";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}

const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

interface CdnEndpoint {
    id: string;
    origin: string;
    ttl: number;
}

describe("CDN Integration Tests", () => {
    it("should test CDN lifecycle", async () => {
        const spacesEndpoint = process.env.SPACES_ENDPOINT; 
        const cdnReq : Cdn_endpoint= {
            origin: spacesEndpoint,
            ttl: 3600
        };
        const cdn: CdnEndpoint = await createCdnEndpoint(cdnReq);
        const cdnId = cdn.id;

        try {
            const listResp = await client.v2.cdn.endpoints.get();
            if (!listResp || !listResp.endpoints) {
                throw new Error("Failed to list CDN endpoints");
            }
            expect(listResp.endpoints.some(endpoint => endpoint.id === cdnId)).toBe(true);
            const getResp = await client.v2.cdn.endpoints.byCdn_id(cdnId).get();
            if (!getResp || !getResp.endpoint) {
                throw new Error("Failed to get CDN endpoint");
            }
            expect(getResp.endpoint.id).toBe(cdnId);
            const newTtl = 86400;
            const updateReq = { ttl: newTtl };
            const updateResp = await client.v2.cdn.endpoints.byCdn_id(cdnId).put(updateReq);
            if (!updateResp || !updateResp.endpoint) {
                throw new Error("Failed to update CDN endpoint");
            }
            expect(updateResp.endpoint.ttl).toBe(newTtl);
            const purgeReq = { files: ["*"] };
            const purgeResp = await client.v2.cdn.endpoints.byCdn_id(cdnId).cache.delete(purgeReq);
            expect(purgeResp).toBeUndefined();

        } finally {
            await deleteCdnEndpoint(cdnId);
        }
    }, 60000);

    async function createCdnEndpoint(req: Cdn_endpoint): Promise<CdnEndpoint> {
        console.log(`Creating CDN endpoint using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.cdn.endpoints.post(req);
            if (resp && resp.endpoint) {
                const endpoint = resp.endpoint;
                console.log(`Created CDN endpoint <ID: ${endpoint.id}>`);
                return {
                    id: endpoint.id as string,
                    origin: endpoint.origin as string,
                    ttl: endpoint.ttl as number,
                };
            } else {
                throw new Error("Failed to create CDN endpoint or endpoint is undefined");
            }
        } catch (err) {
            if (err instanceof Error && 'statusCode' in err) {
                const httpError = err as Error & { 
                    statusCode: number; 
                    response?: { bodyAsText?: string } 
                };
                throw new Error(`Error: ${httpError.statusCode} ${httpError.message}: ${httpError.response?.bodyAsText}`);
            } else {
                throw err;
            }
        }
    }
    async function deleteCdnEndpoint(cdnId: string): Promise<void> {
        console.log(`Deleting CDN endpoint <ID: ${cdnId}>`);
        try {
            await client.v2.cdn.endpoints.byCdn_id(cdnId).delete();
            console.log(`Deleted CDN endpoint <ID: ${cdnId}>`);
        } catch (err) {
            console.error(`Failed to delete CDN endpoint <ID: ${cdnId}>:`, err);
        }
    }
});