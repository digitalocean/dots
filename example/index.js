import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from '../src/dots/DigitalOceanApiKeyAuthenticationProvider.js';
const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN not set");
}
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);
// Create the API client
const client = createDigitalOceanClient(adapter);
async function main() {
    try {
        const volumeReq = {
            sizeGigabytes: 10,
            name: `test-volume`,
            description: "Block storage testing",
            region: "nyc3",
            filesystemType: "ext4",
        };
        const resp = await client.v2.volumes.post(volumeReq);
        if (resp && resp.volume) {
            const volume = resp.volume;
            console.log(`Created volume ${volume.name} <ID: ${volume.id}>`);
        }
        else {
            throw new Error("Failed to create volume or volume is undefined");
        }
        console.log("Done!");
    }
    catch (err) {
        console.error(err);
    }
}
main();
