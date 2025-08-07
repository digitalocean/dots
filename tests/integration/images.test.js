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
const PREFIX = "test";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Image Integration Tests", () => {
    it("should create, list, get, update, and delete image", async () => {
        const expectedName = `${PREFIX}-${uuidv4()}`;
        const imageReq = {
            name: expectedName,
            url: "http://cloud-images.ubuntu.com/minimal/releases/bionic/release/ubuntu-18.04-minimal-cloudimg-amd64.img",
            distribution: "Ubuntu",
            region: "nyc3",
            description: "Cloud-optimized image w/ small footprint",
            tags: ["prod"],
        };
        // Create custom image
        const image = await createCustomImage(imageReq);
        const imageId = image?.id;
        try {
            expect(image.name).toBe(expectedName);
            // List all images
            const listResp = await client.v2.images.get();
            if (!listResp || !listResp.images) {
                throw new Error("Failed to list images");
            }
            expect(listResp.images.length).toBeGreaterThan(0);
            // List all images with prod tag
            const listWithTagResp = await client.v2.images.get({
                queryParameters: { tagName: "prod" }
            });
            if (!listWithTagResp || !listWithTagResp.images) {
                throw new Error("Failed to list images with tag");
            }
            expect(listWithTagResp.images.length).toBeGreaterThan(0);
            expect(listWithTagResp.images[0].tags).toContain("prod");
            // Get an image
            const getResp = await client.v2.images.byImage_id(imageId).get();
            if (!getResp || !getResp.image) {
                throw new Error("Failed to get image");
            }
            expect(getResp.image.name).toBe(expectedName);
            // Update an image
            const newName = `${PREFIX}-${uuidv4()}`;
            const updateReq = {
                name: newName,
                distribution: "Ubuntu",
                description: " "
            };
            const updateResp = await client.v2.images.byImage_id(imageId).put(updateReq);
            if (!updateResp || !updateResp.image) {
                throw new Error("Failed to update image");
            }
            expect(updateResp.image.name).toBe(newName);
        }
        finally {
            // Delete the image
            await deleteImage(imageId);
        }
    });
    // Helper function to create a custom image
    async function createCustomImage(req) {
        console.log(`Creating custom image using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.images.post(req);
            if (resp && resp.image) {
                const image = resp.image;
                console.log(`Created custom image ${image.name} <ID: ${image.id}>`);
                return {
                    id: image.id ?? 0,
                    name: image.name ?? "",
                    distribution: image.distribution ?? "",
                    description: image.description ?? "",
                    createdAt: image.createdAt ? new Date(image.createdAt) : new Date(),
                    errorMessage: image.errorMessage ?? "", // Can be undefined
                    regions: image.regions?.map((r) => String(r)) ?? [],
                    type: image.type ?? "", // Can be undefined
                    tags: image.tags ?? [],
                    status: image.status ?? "",
                };
            }
            else {
                throw new Error("Failed to create custom image or image is undefined");
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
    // Helper function to delete an image
    async function deleteImage(imageId) {
        console.log(`Deleting image <ID: ${imageId}>`);
        try {
            await client.v2.images.byImage_id(imageId).delete();
            console.log(`Deleted image <ID: ${imageId}>`);
        }
        catch (err) {
            console.error(`Failed to delete image <ID: ${imageId}>:`, err);
        }
    }
});
