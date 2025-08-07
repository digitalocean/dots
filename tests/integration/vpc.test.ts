/**
 * Integration tests for VPCs
 */

import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

const PREFIX = "test";
const REGION = "nyc3";

describe("VPCs API Integration Tests", () => {
    it("should create and delete a VPC", async () => {
        const expectedName = `${PREFIX}-${uuidv4()}`;
        const createReq = {
            name: expectedName,
            description: "VPC for testing client gen",
            region: REGION,
        };

        let vpcId: string | undefined;

        try {
            const createResp = await client.v2.vpcs.post(createReq);
            expect(createResp).toBeDefined();
            expect(createResp?.vpc?.name).toBe(expectedName);
            vpcId = createResp?.vpc?.id ?? '';
            expect(vpcId).toBeDefined();
        } finally {
            if (vpcId) {
                await client.v2.vpcs.byVpc_id(vpcId).delete();
            }
        }
    });

    it("should list all VPCs", async () => {
        const listResp = await client.v2.vpcs.get();
        expect(listResp).toBeDefined();
        expect(listResp?.vpcs?.length).toBeGreaterThan(0);
    });

    it("should retrieve a VPC by ID", async () => {
        const expectedName = `${PREFIX}-${uuidv4()}`;
        const createReq = {
            name: expectedName,
            description: "VPC for testing client gen",
            region: REGION,
        };

        let vpcId: string | undefined;

        try {
            const createResp = await client.v2.vpcs.post(createReq);
            expect(createResp).toBeDefined();
            vpcId = createResp?.vpc?.id ?? '';
            expect(vpcId).toBeDefined();
            if(!vpcId){
                throw new Error(`VpcId not Defined`);
            }
            const getResp = await client.v2.vpcs.byVpc_id(vpcId).get();
            expect(getResp).toBeDefined();
            expect(getResp?.vpc?.id).toBe(vpcId);
        } finally {
            if (vpcId) {
                await client.v2.vpcs.byVpc_id(vpcId).delete();
            }
        }
    });

    it("should update a VPC", async () => {
        const initialName = `${PREFIX}-${uuidv4()}`;
        const updatedName = `${PREFIX}-${uuidv4()}`;
        const createReq = {
            name: initialName,
            description: "VPC for testing client gen",
            region: REGION,
        };

        let vpcId: string | undefined;

        try {
            const createResp = await client.v2.vpcs.post(createReq);
            expect(createResp).toBeDefined();
            vpcId = createResp?.vpc?.id ?? '';
            expect(vpcId).toBeDefined();

            const updateReq = { name: updatedName };
            const updateResp = await client.v2.vpcs.byVpc_id(vpcId).put(updateReq);
            expect(updateResp).toBeDefined();
            expect(updateResp?.vpc?.name).toBe(updatedName);
        } finally {
            if (vpcId) {
                await client.v2.vpcs.byVpc_id(vpcId).delete();
            }
        }
    });

    it("should patch a VPC (partial update)", async () => {
        const initialName = `${PREFIX}-${uuidv4()}`;
        const updatedName = `${PREFIX}-${uuidv4()}`;
        const createReq = {
            name: initialName,
            description: "VPC for testing client gen",
            region: REGION,
        };

        let vpcId: string | undefined;

        try {
            const createResp = await client.v2.vpcs.post(createReq);
            expect(createResp).toBeDefined();
            vpcId = createResp?.vpc?.id ?? '';
            expect(vpcId).toBeDefined();

            const patchReq = { name: updatedName };
            const patchResp = await client.v2.vpcs.byVpc_id(vpcId).patch(patchReq);
            expect(patchResp).toBeDefined();
            expect(patchResp?.vpc?.name).toBe(updatedName);
            expect(patchResp?.vpc?.description).toBe(createReq.description);
        } finally {
            if (vpcId) {
                await client.v2.vpcs.byVpc_id(vpcId).delete();
            }
        }
    });
});

