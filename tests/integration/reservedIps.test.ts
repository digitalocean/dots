import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { v4 as uuidv4 } from "uuid";
import { Droplet, Reserved_ip } from "../../src/dots/models/index.js";
import { Reserved_ip_action_assign } from "../../src/dots/models/index.js";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}

const PREFIX = "test";
const REGION = "nyc3";
const DROPLET_SIZE = "s-1vcpu-1gb";
const DROPLET_IMAGE = "ubuntu-22-04-x64";

const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

interface DropletReq {
    name: string;
    region: string;
    size: string;
    image: string;
}

interface ActionReq {
    id: number;
    type: string;
    status: string;
}
interface ReserverdIp {
    region : string
}
describe("Reserved IPs Integration Tests", () => {
    it("should create, assign, unassign, and delete a reserved IP", async () => {
        const dropletName = `${PREFIX}-dots-${uuidv4()}`;
        const createDropletReq: DropletReq = {
            name: dropletName,
            region:  REGION,
            size: DROPLET_SIZE,
            image:DROPLET_IMAGE,
        };

        const droplet: Droplet = await createDroplet(createDropletReq);
        try {
            if (!droplet.id) {
                throw new Error("Droplet ID is missing");
            }            
            await waitForDropletReady(droplet.id);
            const createReservedIpReq : ReserverdIp= {
                region : REGION,
            };
            const reservedIp = await createReservedIp(createReservedIpReq);
            try {
                if (!reservedIp.ip) {
                    throw new Error("Droplet ID is missing");
                }  
                const getResp = await client.v2.reserved_ips.byReserved_ip(reservedIp.ip).get();
                if (!getResp || !getResp.reservedIp) {
                    throw new Error("Failed to get reserved IP");
                }
                expect(getResp.reservedIp.ip).toBe(reservedIp.ip);
                expect(getResp.reservedIp.region?.slug).toBe(REGION);
                expect(getResp.reservedIp.droplet).toEqual({});
                const assignAction: ActionReq = await assignReservedIp(reservedIp.ip, droplet.id);
                await waitForAction(assignAction.id);
                const assignedResp = await client.v2.reserved_ips.byReserved_ip(reservedIp.ip).get();
                if (!assignedResp || !assignedResp.reservedIp) {
                    throw new Error("Failed to get assigned reserved IP");
                }
                expect(assignedResp.reservedIp.droplet?.id).toBe(droplet.id);
                const unassignAction: ActionReq = await unassignReservedIp(reservedIp.ip);
                await waitForAction(unassignAction.id);
                const unassignedResp = await client.v2.reserved_ips.byReserved_ip(reservedIp.ip).get();
                if (!unassignedResp || !unassignedResp.reservedIp) {
                    throw new Error("Failed to get unassigned reserved IP");
                }
                expect(unassignedResp.reservedIp.droplet).toEqual({});
                expect(unassignedResp.reservedIp.region?.slug).toBe(REGION);

            } finally {
                if (!reservedIp.ip) {
                    throw new Error("Droplet ID is missing");
                } 
                await deleteReservedIp(reservedIp.ip);
            }

        } finally {
            if (!droplet.id) {
                throw new Error("Droplet ID is missing");
            }
            await deleteDroplet(droplet.id);
        }
    }, 60000);

    async function createDroplet(req: DropletReq): Promise<Droplet> {
        console.log(`Creating droplet using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.droplets.post(req);
            if (resp && 'droplet' in resp && resp.droplet) {
                const droplet = resp.droplet;
                console.log(`Created droplet ${droplet.id}`);
                return droplet;
            } else {
                throw new Error("Failed to create droplet or droplet is undefined");
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

    async function createReservedIp(req: ReserverdIp): Promise<Reserved_ip> {
        console.log(`Creating reserved IP using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.reserved_ips.post(req);
            if (resp && 'reservedIp' in resp && resp.reservedIp) {
                const reservedIp = resp.reservedIp;
                console.log(`Created reserved IP ${reservedIp.ip}`);
                return resp.reservedIp;
            } else {
                throw new Error("Failed to create reserved IP or IP is undefined");
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

    async function assignReservedIp(ip: string, dropletId : number): Promise<ActionReq> {
        console.log(`Assigning reserved IP ${ip} to droplet ${dropletId}`);
        try {
            const assignRequest : Reserved_ip_action_assign= {
                type: "assign",
                dropletId: dropletId
            };
            const resp = await client.v2.reserved_ips.byReserved_ip(ip).actions.post(assignRequest);
            if (resp && resp.action) {
                const action = resp.action;
                console.log(`Assignment action ${action.id} started`);
                return {
                    id: action.id as number,
                    type: action.type as string,
                    status: action.status as string,
                };
            } else {
                throw new Error("Failed to assign reserved IP or action is undefined");
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

    async function unassignReservedIp(ip: string): Promise<ActionReq> {
        console.log(`Unassigning reserved IP ${ip}`);
        try {
            const unassignRequest: Reserved_ip_action_assign = {
                type: "unassign",
            };
            const resp = await client.v2.reserved_ips.byReserved_ip(ip).actions.post(unassignRequest);
            if (resp && resp.action) {
                const action = resp.action;
                console.log(`Unassignment action ${action.id} started`);
                return {
                    id: action.id as number,
                    type: action.type as string,
                    status: action.status as string,
                };
            } else {
                throw new Error("Failed to unassign reserved IP or action is undefined");
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

    async function waitForDropletReady(dropletId: number): Promise<void> {
        console.log(`Waiting for droplet ${dropletId} to be ready`);
        let attempts = 0;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts) {
            const resp = await client.v2.droplets.byDroplet_id(dropletId).get();
            if (resp?.droplet?.status === "active") {
                console.log(`Droplet ${dropletId} is ready`);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            attempts++;
        }
        throw new Error(`Droplet ${dropletId} did not become ready within expected time`);
    }

    async function waitForAction(actionId: number): Promise<void> {
        console.log(`Waiting for action ${actionId} to complete`);
        let attempts = 0;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts) {
            const resp = await client.v2.actions.byAction_id(actionId).get();
            if (resp?.action?.status === "completed") {
                console.log(`Action ${actionId} completed`);
                return;
            } else if (resp?.action?.status === "errored") {
                throw new Error(`Action ${actionId} failed`);
            }
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            attempts++;
        }
        throw new Error(`Action ${actionId} did not complete within expected time`);
    }

    async function deleteDroplet(dropletId: number): Promise<void> {
        console.log(`Deleting droplet ${dropletId}`);
        try {
            await client.v2.droplets.byDroplet_id(dropletId).delete();
            console.log(`Deleted droplet ${dropletId}`);
        } catch (err) {
            console.error(`Failed to delete droplet ${dropletId}:`, err);
        }
    }

    async function deleteReservedIp(ip: string): Promise<void> {
        console.log(`Deleting reserved IP ${ip}`);
        try {
            await client.v2.reserved_ips.byReserved_ip(ip).delete();
            console.log(`Deleted reserved IP ${ip}`);
        } catch (err) {
            console.error(`Failed to delete reserved IP ${ip}:`, err);
        }
    }

});