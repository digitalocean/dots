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
describe("Firewall Integration Tests", () => {
    it("should create, update, and delete firewall", async () => {
        const tagName = `${PREFIX}-${uuidv4()}`;
        const firewallName = `${PREFIX}-${uuidv4()}`;
        const tagReq = { name: tagName };
        // Create tag first
        await createTag(tagReq);
        try {
            const createReq = {
                name: firewallName,
                outboundRules: [
                    {
                        protocol: "tcp",
                        ports: "80",
                        destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                    }
                ],
                tags: [tagName],
            };
            // Create firewall
            const firewall = await createFirewall(createReq);
            const firewallId = firewall.id;
            try {
                expect(firewallId).toBeDefined();
                expect(firewall.name).toBe(firewallName);
                expect(firewall.tags).toEqual([tagName]);
                expect(firewall.outboundRules[0].protocol).toBe("tcp");
                expect(firewall.outboundRules[0].ports).toBe("80");
                expect(firewall.outboundRules[0].destinations).toEqual({
                    addresses: ["0.0.0.0/0", "::/0"]
                });
                // GET firewall
                const getResp = await client.v2.firewalls.byFirewall_id(firewallId).get();
                if (!getResp || !getResp.firewall) {
                    throw new Error("Failed to get firewall");
                }
                const got = getResp.firewall;
                expect(got.id).toBe(firewallId);
                expect(got.name).toBe(firewallName);
                expect(got.tags).toEqual([tagName]);
                expect(got.outboundRules?.[0]?.protocol).toBe("tcp");
                expect(got.outboundRules?.[0]?.ports).toBe("80");
                expect(got.outboundRules?.[0]?.destinations).toEqual({
                    addresses: ["0.0.0.0/0", "::/0"]
                });
                // Add rule
                const addRuleReq = {
                    inboundRules: [
                        {
                            protocol: "tcp",
                            ports: "2222",
                            sources: { addresses: ["0.0.0.0/0", "::/0"] },
                        }
                    ]
                };
                await client.v2.firewalls.byFirewall_id(firewallId).rules.post(addRuleReq);
                const updatedResp = await client.v2.firewalls.byFirewall_id(firewallId).get();
                if (!updatedResp || !updatedResp.firewall) {
                    throw new Error("Failed to get updated firewall");
                }
                const updated = updatedResp.firewall;
                expect(updated.inboundRules?.[0]?.protocol).toBe("tcp");
                expect(updated.inboundRules?.[0]?.ports).toBe("2222");
                expect(updated.inboundRules?.[0]?.sources).toEqual({
                    addresses: ["0.0.0.0/0", "::/0"]
                });
                // Remove rule
                const removeRuleReq = {
                    outboundRules: [
                        {
                            protocol: "tcp",
                            ports: "80",
                            destinations: { addresses: ["0.0.0.0/0", "::/0"] },
                        }
                    ]
                };
                await client.v2.firewalls.byFirewall_id(firewallId).rules.delete(removeRuleReq);
                const removedResp = await client.v2.firewalls.byFirewall_id(firewallId).get();
                if (!removedResp || !removedResp.firewall) {
                    throw new Error("Failed to get firewall after rule removal");
                }
                const removed = removedResp.firewall;
                expect(removed.outboundRules?.length || 0).toBe(0);
            }
            finally {
                // Delete firewall
                await deleteFirewall(firewallId);
            }
        }
        finally {
            // Delete tag
            await deleteTag(tagName);
        }
    }, 60000);
    // Helper function to create a tag
    async function createTag(req) {
        console.log(`Creating tag using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.tags.post(req);
            if (resp && resp.tag) {
                const tag = resp.tag;
                console.log(`Created tag ${tag.name}`);
                return {
                    name: tag.name,
                    resources: {
                        droplets: {
                            count: tag.resources?.droplets?.count || 0,
                            lastTagged: tag.resources?.droplets?.lastTaggedUri || "",
                        }
                    }
                };
            }
            else {
                throw new Error("Failed to create tag or tag is undefined");
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
    // Helper function to create a firewall
    async function createFirewall(req) {
        console.log(`Creating firewall using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.firewalls.post(req);
            if (resp && resp.firewall) {
                const firewall = resp.firewall;
                console.log(`Created firewall ${firewall.name} <ID: ${firewall.id}>`);
                return {
                    id: firewall.id,
                    name: firewall.name,
                    tags: firewall.tags || [],
                    inboundRules: firewall.inboundRules || [],
                    outboundRules: firewall.outboundRules || [],
                };
            }
            else {
                throw new Error("Failed to create firewall or firewall is undefined");
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
    // Helper function to delete a firewall
    async function deleteFirewall(firewallId) {
        console.log(`Deleting firewall <ID: ${firewallId}>`);
        try {
            await client.v2.firewalls.byFirewall_id(firewallId).delete();
            console.log(`Deleted firewall <ID: ${firewallId}>`);
        }
        catch (err) {
            console.error(`Failed to delete firewall <ID: ${firewallId}>:`, err);
        }
    }
    // Helper function to delete a tag
    async function deleteTag(tagName) {
        console.log(`Deleting tag ${tagName}`);
        try {
            await client.v2.tags.byTag_id(tagName).delete();
            console.log(`Deleted tag ${tagName}`);
        }
        catch (err) {
            console.error(`Failed to delete tag ${tagName}:`, err);
        }
    }
});
