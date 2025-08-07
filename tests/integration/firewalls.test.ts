import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { Tags } from "../../src/dots/models/index.js";
import { Firewall } from "../../src/dots/models/index.js";
import { Firewall_rules } from "../../src/dots/models/index.js";
dotenv.config();

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}

const PREFIX = "test";

const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

interface FirewallReq {
    id: string;
    name: string;
    tags: string[];
    inboundRules: FirewallRule[];
    outboundRules: FirewallRule[];
}

interface FirewallRule {
    protocol: string;
    ports: string;
    sources?: {
        addresses?: string[];
        tags?: string[];
        dropletIds?: number[];
        loadBalancerUids?: string[];
    };
    destinations?: {
        addresses?: string[];
        tags?: string[];
        dropletIds?: number[];
        loadBalancerUids?: string[];
    };
}

interface TagReq {
    name: string;
    resources: {
        droplets: {
            count: number;
            lastTagged: string;
        };
    };
}

describe("Firewall Integration Tests", () => {
    it("should create, update, and delete firewall", async () => {
        const tagName = `${PREFIX}-${uuidv4()}`;
        const firewallName = `${PREFIX}-${uuidv4()}`;
        
        const tagReq: Tags = { name: tagName };

        // Create tag first
        await createTag(tagReq);

        try {
            const createReq: Firewall = {
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
            const firewall: FirewallReq = await createFirewall(createReq);
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
                const addRuleReq: Firewall_rules = {
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
                const removeRuleReq: Firewall_rules = {
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

            } finally {
                // Delete firewall
                await deleteFirewall(firewallId);
            }

        } finally {
            // Delete tag
            await deleteTag(tagName);
        }
    }, 60000);

    // Helper function to create a tag
    async function createTag(req: Tags): Promise<TagReq> {
        console.log(`Creating tag using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.tags.post(req);
            if (resp && resp.tag) {
                const tag = resp.tag;
                console.log(`Created tag ${tag.name}`);
                return {
                    name: tag.name as string,
                    resources: {
                        droplets: {
                            count: tag.resources?.droplets?.count as number || 0,
                            lastTagged: tag.resources?.droplets?.lastTaggedUri as string || "",
                        }
                    }
                };
            } else {
                throw new Error("Failed to create tag or tag is undefined");
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

    // Helper function to create a firewall
    async function createFirewall(req: Firewall): Promise<FirewallReq> {
        console.log(`Creating firewall using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.firewalls.post(req);
            if (resp && resp.firewall) {
                const firewall = resp.firewall;
                console.log(`Created firewall ${firewall.name} <ID: ${firewall.id}>`);
                return {
                    id: firewall.id as string,
                    name: firewall.name as string,
                    tags: firewall.tags as string[] || [],
                    inboundRules: (firewall.inboundRules as FirewallRule[]) || [],
                    outboundRules: (firewall.outboundRules as FirewallRule[]) || [],
                };
            } else {
                throw new Error("Failed to create firewall or firewall is undefined");
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

    // Helper function to delete a firewall
    async function deleteFirewall(firewallId: string): Promise<void> {
        console.log(`Deleting firewall <ID: ${firewallId}>`);
        try {
            await client.v2.firewalls.byFirewall_id(firewallId).delete();
            console.log(`Deleted firewall <ID: ${firewallId}>`);
        } catch (err) {
            console.error(`Failed to delete firewall <ID: ${firewallId}>:`, err);
        }
    }

    // Helper function to delete a tag
    async function deleteTag(tagName: string): Promise<void> {
        console.log(`Deleting tag ${tagName}`);
        try {
            await client.v2.tags.byTag_id(tagName).delete();
            console.log(`Deleted tag ${tagName}`);
        } catch (err) {
            console.error(`Failed to delete tag ${tagName}:`, err);
        }
    }
});