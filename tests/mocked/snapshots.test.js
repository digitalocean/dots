// /**
//  * Mock tests for the Snapshots API 
//  */
export {};
// import nock from "nock";
// import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
// import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
// import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
// const baseUrl = "https://api.digitalocean.com";
// const token = "test-token";
// const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
// const adapter = new FetchRequestAdapter(authProvider);
// const client = createDigitalOceanClient(adapter);
// describe("Snapshots API Mock Tests", () => {
//     afterEach(() => {
//         nock.cleanAll();
//     });
//     it("should mock the snapshots list operation", async () => {
//         const expected = {
//             snapshots: [
//                 {
//                     id: "6372321",
//                     name: "web-01-1595954862243",
//                     created_at: "2020-07-28T16:47:44Z",
//                     regions: ["nyc3", "sfo3"],
//                     resource_id: "200776916",
//                     resource_type: "droplet",
//                     min_disk_size: 25,
//                     size_gigabytes: 2.34,
//                     tags: ["web", "env:prod"],
//                 },
//                 {
//                     id: "fbe805e8-866b-11e6-96bf-000f53315a41",
//                     name: "pvc-01-1595954862243",
//                     created_at: "2019-09-28T23:14:30Z",
//                     regions: ["nyc1"],
//                     resource_id: "89bcc42f-85cf-11e6-a004-000f53315871",
//                     resource_type: "volume",
//                     min_disk_size: 2,
//                     size_gigabytes: 0.1008,
//                     tags: ["k8s"],
//                 },
//             ],
//             links: {},
//             meta: { total: 2 },
//         };
//         const typeExpected = {
//             snapshots: [
//                 {
//                     id: "6372321",
//                     name: "web-01-1595954862243",
//                     createdAt: new Date("2020-07-28T16:47:44Z"),
//                     regions: ["nyc3", "sfo3"],
//                     resourceId: "200776916",
//                     resourceType: "droplet",
//                     minDiskSize: 25,
//                     sizeGigabytes: 2.34,
//                     tags: ["web", "env:prod"],
//                 },
//                 {
//                     id: "fbe805e8-866b-11e6-96bf-000f53315a41",
//                     name: "pvc-01-1595954862243",
//                     createdAt: new Date("2019-09-28T23:14:30Z"),
//                     regions: ["nyc1"],
//                     resourceId: "89bcc42f-85cf-11e6-a004-000f53315871",
//                     resourceType: "volume",
//                     minDiskSize: 2,
//                     sizeGigabytes: 0.1008,
//                     tags: ["k8s"],
//                 },
//             ],
//             links: {},
//             meta: { total: 2 },
//         };
//         nock(baseUrl).get("/v2/snapshots").reply(200, expected);
//         const listResp = await client.v2.snapshots.get();
//         expect(listResp).toEqual(typeExpected);
//     });
//     it("should retrieve an existing snapshot", async () => {
//         const expected = {
//             snapshot: {
//                 id: "6372321",
//                 name: "web-01-1595954862243",
//                 created_at: "2020-07-28T16:47:44Z",
//                 regions: ["nyc3", "sfo3"],
//                 min_disk_size: 25,
//                 size_gigabytes: 2.34,
//                 resource_id: "200776916",
//                 resource_type: "droplet",
//                 tags: ["web", "env:prod"],
//             },
//         };
//         const typeExpected = {
//             snapshot: {
//                 id: "6372321",
//                 name: "web-01-1595954862243",
//                 createdAt: new Date("2020-07-28T16:47:44Z"),
//                 regions: ["nyc3", "sfo3"],
//                 minDiskSize: 25,
//                 sizeGigabytes: 2.34,
//                 resourceId: "200776916",
//                 resourceType: "droplet",
//                 tags: ["web", "env:prod"],
//             },
//         };
//         nock(baseUrl).get("/v2/snapshots/6372321").reply(200, expected);
//         const getResp = await client.v2.snapshots.bySnapshot_id("6372321").get();
//         expect(getResp).toEqual(typeExpected);
//     }); 
//     it("should delete a snapshot", async () => {
//         nock(baseUrl).delete("/v2/snapshots/6372321").reply(204);
//         const delResp = await client.v2.snapshots.bySnapshot_id("6372321").delete();
//         expect(delResp).toBeUndefined();
//     });
// });
