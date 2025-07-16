import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { v4 as uuidv4 } from "uuid";
import { Volumes_ext4, Volume_action_post_attach } from "../../src/dots/models/index.js";
const token = "mock-token";
const REGION = "nyc3";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

describe("Integration Tests", () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    it("should create a droplet and attach a volume", async () => {
        // Mock SSH key retrieval
        nock("https://api.digitalocean.com")
            .get("/v2/account/keys")
            .reply(200, {
                ssh_keys: [{ name: "test-key", fingerprint: "mock-fingerprint" }],
            });

        // Mock droplet creation
        nock("https://api.digitalocean.com")
            .post("/v2/droplets")
            .reply(200, { droplet: { id: 123, name: "test-droplet" } });

        // Mock droplet details retrieval
        nock("https://api.digitalocean.com")
            .get("/v2/droplets/123")
            .reply(200, {
                droplet: {
                    id: 123,
                    name: "test-droplet",
                    networks: { v4: [{ type: "public", ip_address: "1.2.3.4" }] },
                },
            });

        // Mock volume creation
        nock("https://api.digitalocean.com")
            .post("/v2/volumes")
            .reply(200, { volume: { id: '456', name: "test-volume"} });

        // Mock volume attachment
        nock("https://api.digitalocean.com")
            .post("/v2/volumes/456/actions")
            .reply(200, { action: { id: 789, status: "in-progress", type: "attach" } });

        // Mock action status retrieval
        nock("https://api.digitalocean.com")
            .get("/v2/actions/789")
            .reply(200, { action: { id: "789", status: "completed" } });

        // Run the test workflow
        const keyName = "test-key";
        const sshKey = await findSshKey(keyName);

        const dropletReq = {
            name: `test-${uuidv4()}`,
            region: REGION,
            size: "s-1vcpu-1gb",
            image: "ubuntu-22-04-x64",
            ssh_keys: [sshKey.fingerprint],
        };

        const droplet = await createDroplet(dropletReq);
        expect((droplet as { id: number }).id).toBe(123);

        const volumeReq :Volumes_ext4 = {
            sizeGigabytes: 10,
            name: `test-${uuidv4()}`,
            description: "Block storage testing",
            region: REGION,
            filesystemType: "ext4",
        };

        const volume = await createVolume(volumeReq);
        expect((volume as { id: string }).id).toBe("456");

        const volumeActionReq : Volume_action_post_attach = {
            dropletId: (droplet as { id: number }).id,
            type: "attach",
        };

        console.log(`Attaching volume ${(volume as { id: string }).id} to Droplet ${(droplet as { id: number }).id}...`);
        try {
            const actionResp = await client.v2.volumes.byVolume_id((volume as { id: string }).id).actions.post(volumeActionReq);
            if (actionResp?.action?.id !== undefined && actionResp.action.id !== null) {
                await waitForAction(actionResp.action.id);
                expect(actionResp.action.id).toBe(789);

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

    });

    // Helper functions
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


async function createDroplet(req: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
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
                    return droplet as Record<string, unknown>;
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


async function createVolume(req: Volumes_ext4 | Record<string, unknown>): Promise<Record<string, unknown>> {
    console.log(`Creating volume using: ${JSON.stringify(req)}`);
    try {
        const resp = await client.v2.volumes.post(req);
        if (resp && resp.volume) {
            const volume = resp.volume;
            console.log(`Created volume ${volume.name} <ID: ${volume.id}>`);
            return volume as Record<string, unknown>;
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

});