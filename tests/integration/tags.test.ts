/**
 * Integration tests for tags.
 */

import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { Tags_resource } from "../../src/dots/models/index.js";

dotenv.config();

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);


const REGION = "nyc3";
interface Droplet{
    id: number;
    name: string;
    region: string;
    size: string;
    image: string;
    networks: {
        v4: { ip_address: string; type: string }[];
    };
}

interface DropletRequest {
    name: string;
    region: string;
    size: string;
    image: string;
    ssh_keys?: string[];
}

describe("Tags API Integration Tests", () => {
    it("should create, retrieve, assign, and delete a tag", async () => {
        const tagName = `test-dots-${uuidv4()}`;
        const createBody = { name: tagName };
        const createTagResp = await client.v2.tags.post(createBody);
        console.log(createTagResp);
        expect(createTagResp).toBeDefined();
        expect(createTagResp?.tag?.name).toBe(tagName);


        try {
            const getTagResp = await client.v2.tags.byTag_id(tagName).get();
            console.log(getTagResp);
            expect(getTagResp).toBeDefined();
            expect(getTagResp?.tag?.name).toBe(tagName);
            expect(getTagResp?.tag?.resources?.count).toBe(0);
        const keyName = process.env.SSH_KEY_NAME;
        if (!keyName) {
            throw new Error("SSH_KEY_NAME not set");
        }
        const sshKey = await findSshKey(keyName);
        const fingerprint : string[] = [sshKey.fingerprint ?? (() => { throw new Error("SSH key fingerprint is undefined or null"); })()]
        const dropletReq :DropletRequest = {
            name: `test-${uuidv4()}`,
            region: REGION,
            size: "s-1vcpu-1gb",
            image: "ubuntu-22-04-x64",
            ssh_keys:fingerprint,
        };

            const droplet: Droplet = await createDroplet(dropletReq);
            expect(droplet).toBeDefined();
            if(!droplet?.id){
                throw new Error('Droplet not Created')
            }
            const dropletId = droplet?.id;
            expect(dropletId).toBeDefined();
            if (!dropletId) {
                throw new Error("Droplet ID is not defined");
            }
            await waitForDropletActive(dropletId);
            const assignReq : Tags_resource= {
                resources: [
                    {
                        resourceId: dropletId.toString(),
                        resourceType: "droplet",
                    },
                ],
            };
            console.log(`TagName:`,tagName);
            const assignTagResp = await client.v2.tags.byTag_id(tagName).resources.post(assignReq);
            expect(assignTagResp).toBeUndefined();
            const getTagAfterAssignResp = await client.v2.tags.byTag_id(tagName).get();
            expect(getTagAfterAssignResp).toBeDefined();
            expect(getTagAfterAssignResp?.tag?.resources?.lastTaggedUri).toBe(
                `https://api.digitalocean.com/v2/droplets/${dropletId}`
            );
            expect(getTagAfterAssignResp?.tag?.resources?.count).toBe(1);
            expect(getTagAfterAssignResp?.tag?.resources?.droplets?.count).toBe(1);
        } finally {
            await client.v2.tags.byTag_id(tagName).delete();
        }
    }, 60000); 
});

async function waitForDropletActive(dropletId: number): Promise<void> {
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
        const dropletResp = await client.v2.droplets.byDroplet_id(dropletId).get();
        if (dropletResp?.droplet?.status === "active") {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10000)); 
        attempts++;
    }

    throw new Error(`Droplet ${dropletId} did not become active within the expected time`);
}


async function createDroplet(req: DropletRequest): Promise<Droplet> {
    console.log(`Creating Droplet using: ${JSON.stringify(req)}`);
    try {
        const resp = await client.v2.droplets.post(req);
        if (resp && 'droplet' in resp) {
            const dropletId = resp.droplet?.id;

            if (dropletId) {
                let droplet;
                let attempts = 0;
                const maxAttempts = 10;
                const delay = 5000; // 5 seconds

                while (attempts < maxAttempts) {
                    const getResp = await client.v2.droplets.byDroplet_id(dropletId).get();
                    if (getResp && 'droplet' in getResp) {
                        droplet = getResp.droplet;
                        if (droplet?.networks && droplet.networks.v4 && droplet.networks.v4.length > 0) {
                            break;
                        }
                    }
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                if (droplet && droplet.networks && droplet.networks.v4) {
                    let ipAddress = "";
                    for (const net of droplet.networks.v4) {
                        if (net?.type === "public" && net.ipAddress) {
                            ipAddress = net.ipAddress;
                        }
                    }
                    console.log(`Droplet ID: ${dropletId} Name: ${droplet.name} IP: ${ipAddress}`);
                    if (droplet?.id == null) {
                        throw new Error("Droplet ID is null or undefined");
                    }
                    return {
                        id: droplet.id,
                        name: droplet.name as string,
                        region: droplet.region as string,
                        size: droplet.size as string,
                        image: droplet.image as string,
                        networks: {
                            v4: (droplet.networks?.v4
                                ?.filter((net: { ipAddress?: string | null; type?: string | null }) =>
                                    typeof net.ipAddress === "string" && !!net.type
                                )
                                .map((net: { ipAddress?: string | null; type?: string | null }) => ({
                                    ip_address: net.ipAddress as string,
                                    type: net.type as string,
                                }))
                            ) ?? [],
                        },
                    };
                } else {
                    throw new Error("Failed to retrieve droplet details or networks information");
                }
            } else {
                throw new Error("Droplet ID is undefined");
            }
        } else {
            throw new Error("Failed to create droplet");
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

async function findSshKey(name: string): Promise<{ name?: string | null; fingerprint?: string | null }> {
    console.log(`Looking for SSH key named ${name}...`);
    let paginated = true;
    while (paginated) {
        try {
            const resp = await client.v2.account.keys.get();
            if (resp && resp.sshKeys) {
                for (const k of resp.sshKeys) {
                    if (k.name === name) {
                        console.log(`Found SSH key: ${k.fingerprint}`);
                        return k;
                    }
                }
                const pages = resp.links?.pages;
                if (pages && 'next' in pages) {
                    const nextUrl = pages.next;
                    if (nextUrl) {
                        const parsedUrl = new URL(nextUrl);
                        const nextPage = parseInt(parsedUrl.searchParams.get("page")!);
                        console.log(`Next page: ${nextPage}`);
                    } else {
                        paginated = false;
                    }
                } else {
                    console.log("No next page available");
                    paginated = false;
                }
            } else {
                throw new Error("Failed to retrieve SSH keys");
            }
        } catch (err) {
            console.error(`Error: ${err}`);
            throw err;
        }
    }
    throw new Error("No SSH key found");
}
