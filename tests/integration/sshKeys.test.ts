// /**
//  * Integration tests for SSH keys.
//  */

// import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
// import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
// import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
// import dotenv from "dotenv";

// dotenv.config();

// const token = process.env.DIGITALOCEAN_TOKEN;
// if (!token) {
//     throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
// }
// const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
// const adapter = new FetchRequestAdapter(authProvider);
// const client = createDigitalOceanClient(adapter);

// describe("SSH Keys API Integration Tests", () => {
//     it("should create, retrieve, update, and delete an SSH key", async () => {
//         const publicKey = process.env.PUBLIC_KEY; 
//         const createResp = await client.v2.account.keys.post({ publicKey });
//         expect(createResp).toBeDefined();
//         const fingerprint = createResp?.sshKey?.fingerprint;
//         expect(fingerprint).toBeDefined();

//         try {
//             if(!fingerprint){
//                 throw new Error(`fingerPrint Not Defined`);
//             }
//             const getByFingerprintResp = await client.v2.account.keys.bySsh_key_identifier(fingerprint).get();
//             expect(getByFingerprintResp).toBeDefined();
//             expect(getByFingerprintResp?.sshKey?.fingerprint).toBe(fingerprint);
//             const name = getByFingerprintResp?.sshKey?.name;
//             const keyId = getByFingerprintResp?.sshKey?.id;
//             expect(name).toBeDefined();
//             expect(keyId).toBeDefined();
//             if(!keyId){
//                 throw new Error(`fingerPrint Not Defined`);
//             }
//             const getByIdResp = await client.v2.account.keys.bySsh_key_identifier(keyId).get();
//             expect(getByIdResp).toBeDefined();
//             expect(getByIdResp?.sshKey?.fingerprint).toBe(fingerprint);
//             expect(getByIdResp?.sshKey?.name).toBe(name);
//             const newName = `${name}-updated`;
//             const updateResp = await client.v2.account.keys.bySsh_key_identifier(keyId.toString()).put({ name: newName });
//             expect(updateResp).toBeDefined();
//             expect(updateResp?.sshKey?.name).toBe(newName);
//         } finally {
//             if (fingerprint) {
//                 await client.v2.account.keys.bySsh_key_identifier(fingerprint).delete();
//             }
//         }
//     }, 60000); 
// });