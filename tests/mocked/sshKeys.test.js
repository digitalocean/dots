/**
 * Mock tests for the SSH Keys API resource
 */
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("SSH Keys API Mock Tests", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should mock the SSH keys list operation", async () => {
        const expected = {
            ssh_keys: [
                {
                    id: 1234,
                    public_key: "ssh-rsa aaaBBBccc123 key",
                    name: "key",
                    fingerprint: "17:23:a1:4f:55:4b:59:c6:ad:f7:69:dc:4e:85:e4:8a",
                },
                {
                    id: 5678,
                    public_key: "ssh-rsa longKeyString test",
                    name: "test",
                    fingerprint: "0a:56:d2:46:64:64:12:95:34:ce:e7:vf:0f:c8:5a:d3",
                },
            ],
            links: { pages: {} },
            meta: { total: 2 },
        };
        const typeExpected = {
            sshKeys: [
                {
                    id: 1234,
                    publicKey: "ssh-rsa aaaBBBccc123 key",
                    name: "key",
                    fingerprint: "17:23:a1:4f:55:4b:59:c6:ad:f7:69:dc:4e:85:e4:8a",
                },
                {
                    id: 5678,
                    publicKey: "ssh-rsa longKeyString test",
                    name: "test",
                    fingerprint: "0a:56:d2:46:64:64:12:95:34:ce:e7:vf:0f:c8:5a:d3",
                },
            ],
            links: { pages: {} },
            meta: { total: 2 },
        };
        nock(baseUrl).get("/v2/account/keys").reply(200, expected);
        const keys = await client.v2.account.keys.get();
        expect(keys).toEqual(typeExpected);
    });
    it("should retrieve an SSH key by ID", async () => {
        const expected = {
            ssh_key: {
                id: 1234,
                public_key: "ssh-rsa aaaBBBccc123 key",
                name: "key",
                fingerprint: "17:23:a1:4f:55:4b:59:c6:ad:f7:69:dc:4e:85:e4:8a",
            },
        };
        const typeExpected = {
            sshKey: {
                id: 1234,
                publicKey: "ssh-rsa aaaBBBccc123 key",
                name: "key",
                fingerprint: "17:23:a1:4f:55:4b:59:c6:ad:f7:69:dc:4e:85:e4:8a",
            },
        };
        nock(baseUrl).get("/v2/account/keys/1234").reply(200, expected);
        const key = await client.v2.account.keys.bySsh_key_identifier("1234").get();
        expect(key).toEqual(typeExpected);
    });
    it("should create an SSH key", async () => {
        const expected = {
            ssh_key: {
                id: 1234,
                public_key: "ssh-rsa aaaBBBccc123 key",
                name: "key",
                fingerprint: "17:23:a1:4f:55:4b:59:c6:ad:f7:69:dc:4e:85:e4:8a",
            },
        };
        const typeExpected = {
            sshKey: {
                id: 1234,
                publicKey: "ssh-rsa aaaBBBccc123 key",
                name: "key",
                fingerprint: "17:23:a1:4f:55:4b:59:c6:ad:f7:69:dc:4e:85:e4:8a",
            },
        };
        nock(baseUrl).post("/v2/account/keys", { name: "key", public_key: "ssh-rsa aaaBBBccc123 key" }).reply(201, expected);
        const key = await client.v2.account.keys.post({ name: "key", publicKey: "ssh-rsa aaaBBBccc123 key" });
        expect(key).toEqual(typeExpected);
    });
    it("should update an SSH key", async () => {
        const expected = {
            ssh_key: {
                id: 1234,
                public_key: "ssh-rsa aaaBBBccc123 key",
                name: "new-name",
                fingerprint: "17:23:a1:4f:55:4b:59:c6:ad:f7:69:dc:4e:85:e4:8a",
            },
        };
        const typeExpected = {
            sshKey: {
                id: 1234,
                publicKey: "ssh-rsa aaaBBBccc123 key",
                name: "new-name",
                fingerprint: "17:23:a1:4f:55:4b:59:c6:ad:f7:69:dc:4e:85:e4:8a",
            },
        };
        nock(baseUrl).put("/v2/account/keys/1234", { name: "new-name" }).reply(200, expected);
        const key = await client.v2.account.keys.bySsh_key_identifier("1234").put({ name: "new-name" });
        expect(key).toEqual(typeExpected);
    });
    it("should delete an SSH key", async () => {
        nock(baseUrl).delete("/v2/account/keys/1234").reply(204);
        const delResp = await client.v2.account.keys.bySsh_key_identifier("1234").delete();
        expect(delResp).toBeUndefined();
    });
    it("should handle error response for SSH key deletion", async () => {
        const expected = {
            id: "not_found",
            message: "The resource you requested could not be found.",
        };
        nock(baseUrl).delete("/v2/account/keys/1234").reply(404, expected);
        try {
            await client.v2.account.keys.bySsh_key_identifier("1234").delete();
        }
        catch (error) {
            if (typeof error === "object" && error !== null && "messageEscaped" in error) {
                expect(error.messageEscaped).toEqual(expected.message);
            }
        }
    });
});
