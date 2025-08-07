// /**
//  * Integration tests for snapshots.
//  */

// import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
// import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
// import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
// import dotenv from "dotenv";
// import { v4 as uuidv4 } from "uuid";
// import { Volumes_ext4 } from "../../src/dots/models/index.js";
// dotenv.config();

// const token = process.env.DIGITALOCEAN_TOKEN;
// if (!token) {
//     throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
// }
// const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
// const adapter = new FetchRequestAdapter(authProvider);
// const client = createDigitalOceanClient(adapter);

// const PREFIX = "test";
// const REGION = "nyc3";

// describe("Snapshots API Integration Tests", () => {
//     it("should list, retrieve, and delete a snapshot", async () => {
//         const volumeReq : Volumes_ext4= {
//             sizeGigabytes: 10,
//             name: `${PREFIX}-${uuidv4()}`,
//             description: "Snapshots testing",
//             region: REGION,
//             filesystemType: "ext4",
//         };
//         const volumeResp = await client.v2.volumes.post(volumeReq);
//         expect(volumeResp).toBeDefined();
//         const volId = volumeResp?.volume?.id;
//         expect(volId).toBeDefined();

//         try {
//             const expectedName = `${PREFIX}-${uuidv4()}`;
//             if(!volId){
//                 throw new Error(`VolId is not defined`);
//             }
//             const volAttachResp = await client.v2.volumes.byVolume_id(volId).snapshots.post({
//                 name: expectedName,
//             });
//             expect(volAttachResp).toBeDefined();
//             expect(volAttachResp?.snapshot?.name).toBe(expectedName);
//             console.log(volAttachResp);
//             const snapshotId = volAttachResp?.snapshot?.id;
//             expect(snapshotId).toBeDefined();
//             const listResp = await client.v2.snapshots.get();
//             expect(listResp).toBeDefined();
//             expect(listResp?.snapshots?.length).toBeGreaterThan(0);
//             if(!snapshotId){
//                 throw new Error(`VolId is not defined`);
//             }
//             const getResp = await client.v2.snapshots.bySnapshot_id(snapshotId).get();
//             expect(getResp).toBeDefined();
//             if (getResp) {
//                 expect(getResp.snapshot?.name).toBe(expectedName);
//             }
//             if(!snapshotId){
//                 throw new Error(`Snapshot is not defined`);
//             }
//             const deleteResp = await client.v2.snapshots.bySnapshot_id(snapshotId).delete();
//             expect(deleteResp).toBeUndefined();
//         } finally {
//             if (volId) {
//                 await client.v2.volumes.byVolume_id(volId).delete();
//             }
//         }
//     }, 60000); 
// });