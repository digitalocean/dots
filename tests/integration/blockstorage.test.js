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
const REGION = "nyc3";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Block Storage Integration Tests", () => {
    it("should test block storage snapshots", async () => {
        const volumeReq = {
            sizeGigabytes: 10,
            name: `test-${uuidv4()}`,
            description: "Snapshots testing",
            region: REGION,
            filesystemType: "ext4",
        };
        const volume = await createVolume(volumeReq);
        const volumeId = volume.id;
        const snapshotName = `test-${uuidv4()}`;
        const snapshotResp = await client.v2.volumes.byVolume_id(volumeId).snapshots.post({ name: snapshotName });
        if (!snapshotResp || !snapshotResp.snapshot) {
            throw new Error("Failed to create snapshot or snapshot is undefined");
        }
        expect(snapshotResp.snapshot.name).toBe(snapshotName);
        const snapshotId = snapshotResp.snapshot.id ?? '';
        const listResp = await client.v2.volumes.byVolume_id(volumeId).snapshots.get();
        if (!listResp || !listResp.snapshots) {
            throw new Error("Failed to create snapshot or snapshot is undefined");
        }
        expect(listResp.snapshots.length).toBeGreaterThan(0);
        const getResp = await client.v2.volumes.snapshots.bySnapshot_id(snapshotId).get();
        if (!getResp || !getResp.snapshot) {
            throw new Error("Failed to create snapshot or snapshot is undefined");
        }
        expect(getResp.snapshot.name).toBe(snapshotName);
        const deleteResp = await client.v2.volumes.snapshots.bySnapshot_id(snapshotId).delete();
        expect(deleteResp).toBeUndefined();
    }, 50000);
    it("should test block storage", async () => {
        const volumeReq = {
            sizeGigabytes: 10,
            name: `test-${uuidv4()}`,
            description: "Block storage testing",
            region: REGION,
            filesystemType: "ext4",
        };
        const volume = await createVolume(volumeReq);
        const volumeId = volume.id;
        expect(volumeId).toBeDefined();
        const listResp = await client.v2.volumes.get();
        if (!listResp || !listResp.volumes) {
            throw new Error("Failed to create snapshot or snapshot is undefined");
        }
        expect(listResp.volumes.length).toBeGreaterThan(0);
        const getResp = await client.v2.volumes.byVolume_id(volumeId).get();
        if (!getResp || !getResp.volume) {
            throw new Error("Failed to create snapshot or snapshot is undefined");
        }
        expect(getResp.volume.name).toBe(volume.name);
        const deleteResp = await client.v2.volumes.byVolume_id(volumeId).delete();
        expect(deleteResp).toBeUndefined();
    }, 50000);
    async function createVolume(req) {
        console.log(`Creating volume using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.volumes.post(req);
            if (resp && resp.volume) {
                const volume = resp.volume;
                console.log(`Created volume ${volume.name} <ID: ${volume.id}>`);
                return {
                    id: volume.id,
                    name: volume.name,
                    sizeGigabytes: volume.sizeGigabytes,
                    description: volume.description,
                    region: volume.region,
                    filesystemType: volume.filesystemType,
                };
            }
            else {
                throw new Error("Failed to create volume or volume is undefined");
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
});
