import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from '../src/dots/DigitalOceanApiKeyAuthenticationProvider.js';
import {v4 as uuidv4} from 'uuid';
import {Volume_action_post_attach, Volumes_ext4} from "../src/dots/models/index.js";
import dotenv from 'dotenv';
dotenv.config({path: "../.env"});


const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN not set");
}

const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token!);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);
// Create the API client
const client = createDigitalOceanClient(adapter);
const REGION = "nyc3"; // Example region, change as needed

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

interface Volume {
    id: string;
    name: string;
    sizeGigabytes: number;
    description: string;
    region: string;
    filesystemType: string;
}

async function main(): Promise<void> {
    try {
        const keyName = process.env.SSH_KEY_NAME;
        if (!keyName) {
            throw new Error("SSH_KEY_NAME not set");
        }
        const sshKey = await findSshKey(keyName);
        const fingerprint : string[] = [sshKey.fingerprint ?? (() => { throw new Error("SSH key fingerprint is undefined or null"); })()]
        const dropletReq : DropletRequest = {
            name: `test-${uuidv4()}`,
            region: REGION,
            size: "s-1vcpu-1gb",
            image: "ubuntu-22-04-x64",
            ssh_keys: fingerprint,
        };

        const droplet = await createDroplet(dropletReq);
        console.log("Droplet created: ", (droplet as { id: number }).id);

        const volumeReq: Volumes_ext4 = {
            sizeGigabytes: 10,
            name: `test-${uuidv4()}`,
            description: "Block storage testing",
            region: REGION,
            filesystemType: "ext4",
        };

        const volume = await createVolume(volumeReq);
        console.log("Volume created: ", (volume.id));

        const volumeActionReq: Volume_action_post_attach  = {
            dropletId: (droplet as { id: number }).id,
            type: "attach",
        };

        console.log(`Attaching volume ${volume.id} to Droplet ${droplet.id}...`);
        try {
            const actionResp = await client.v2.volumes.byVolume_id(volume.id).actions.post(volumeActionReq);
            if (actionResp?.action?.id !== undefined && actionResp.action.id !== null) {
                await waitForAction(actionResp.action.id);
            } else {
                throw new Error("Action ID is undefined or null");
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

        console.log("Done!");

    } catch (err) {
        console.error(err);
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


async function createVolume(req: Volumes_ext4): Promise<Volume> {
    console.log(`Creating volume using: ${JSON.stringify(req)}`);
    try {
        const resp = await client.v2.volumes.post(req);
        if (resp && resp.volume) {
            const volume = resp.volume;
            console.log(`Created volume ${volume.name} <ID: ${volume.id}>`);
            return {
                id: volume.id as string,
                name: volume.name as string,
                sizeGigabytes: volume.sizeGigabytes as number,
                description: volume.description as string,
                region: volume.region as string,
                filesystemType: volume.filesystemType as string,
            };
        } else {
            throw new Error("Failed to create volume or volume is undefined");
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
async function waitForAction(id: number, wait: number = 5): Promise<void> {
    console.log(`Waiting for action ${id} to complete...`, "", { flush: true });
    let status = "in-progress";
    while (status === "in-progress") {
        try {
            const resp = await client.v2.actions.byAction_id(id).get();
            if (resp && resp.action) {
                status = resp.action.status as string;
            } else {
                throw new Error("Response or action is undefined");
            }
            if (status === "in-progress") {
                process.stdout.write(".");
                await new Promise(resolve => setTimeout(resolve, wait * 1000));
            } else if (status === "errored") {
                throw new Error(`${resp.action.type} action ${resp.action.id} ${status}`);
            } else {
                console.log(".");
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
}

main();