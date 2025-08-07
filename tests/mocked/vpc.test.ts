/**
 * Mock tests for the VPCs API
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

describe("VPCs API Mock Tests", () => {
    afterEach(() => {
        nock.cleanAll();
    });

    it("should mock the VPC creation operation", async () => {
        const expected = {
            vpc: {
                name: "env.prod-vpc",
                description: "VPC for production environment",
                region: "nyc1",
                ip_range: "10.10.10.0/24",
                default: true,
                id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                urn: "do:droplet:13457723",
                created_at: "2020-03-13T19:20:47.442049222Z",
            },
        };

         const typeExpected = {
            vpc: {
                name: "env.prod-vpc",
                description: "VPC for production environment",
                region: "nyc1",
                ipRange: "10.10.10.0/24",
                defaultEscaped: true,
                id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                urn: "do:droplet:13457723",
                createdAt: new Date("2020-03-13T19:20:47.442049222Z"),
            },
        };

        nock(baseUrl).post("/v2/vpcs", {
            name: "env.prod-vpc",
            description: "VPC for production environment",
            region: "nyc1",
            ip_range: "10.10.10.0/24",
        }).reply(201, expected);

        const createResp = await client.v2.vpcs.post({
            name: "env.prod-vpc",
            description: "VPC for production environment",
            region: "nyc1",
            ipRange: "10.10.10.0/24",
        });

        expect(createResp).toEqual(typeExpected);
    });

    it("should mock the VPC list operation", async () => {
        const expected = {
            vpcs: [
                {
                    name: "env.prod-vpc",
                    description: "VPC for production environment",
                    region: "nyc1",
                    ip_range: "10.10.10.0/24",
                    id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                    urn: "do:vpc:5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                    default: true,
                    created_at: "2020-03-13T19:20:47.442049222Z",
                },
            ],
            links: {},
            meta: { total: 1 },
        };

        const typeExpected = {
            vpcs: [
                {
                    name: "env.prod-vpc",
                    description: "VPC for production environment",
                    region: "nyc1",
                    ipRange: "10.10.10.0/24",
                    id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                    urn: "do:vpc:5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                    defaultEscaped: true,
                    createdAt: new Date("2020-03-13T19:20:47.442049222Z"),
                },
            ],
            links: {},
            meta: { total: 1 },
        };

        nock(baseUrl).get("/v2/vpcs").reply(200, expected);

        const listResp = await client.v2.vpcs.get();
        expect(listResp).toEqual(typeExpected);
    });

    it("should mock the VPC retrieval operation", async () => {
        const expected = {
            vpc: {
                name: "env.prod-vpc",
                description: "VPC for production environment",
                region: "nyc1",
                ip_range: "10.10.10.0/24",
                default: true,
                id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                urn: "do:droplet:13457723",
                created_at: "2020-03-13T19:20:47.442049222Z",
            },
        };

        const typeExpected = {
            vpc: {
                name: "env.prod-vpc",
                description: "VPC for production environment",
                region: "nyc1",
                ipRange: "10.10.10.0/24",
                defaultEscaped: true,
                id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                urn: "do:droplet:13457723",
                createdAt: new Date("2020-03-13T19:20:47.442049222Z"),
            },
        };        

        nock(baseUrl).get("/v2/vpcs/5a4981aa-9653-4bd1-bef5-d6bff52042e4").reply(200, expected);

        const getResp = await client.v2.vpcs.byVpc_id("5a4981aa-9653-4bd1-bef5-d6bff52042e4").get();
        expect(getResp).toEqual(typeExpected);
    });

    it("should mock the VPC update operation", async () => {
        const expected = {
            vpc: {
                name: "env.prod-vpc",
                description: "VPC for production environment",
                region: "nyc1",
                ip_range: "10.10.10.0/24",
                default: true,
                id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                urn: "do:droplet:13457723",
                created_at: "2020-03-13T19:20:47.442049222Z",
            },
        };

        const typeExpected = {
            vpc: {
                name: "env.prod-vpc",
                description: "VPC for production environment",
                region: "nyc1",
                ipRange: "10.10.10.0/24",
                defaultEscaped: true,
                id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                urn: "do:droplet:13457723",
                createdAt: new Date("2020-03-13T19:20:47.442049222Z"),
            },
        };

        nock(baseUrl).put("/v2/vpcs/5a4981aa-9653-4bd1-bef5-d6bff52042e4", {
            name: "env.prod-vpc",
            description: "VPC for production environment",
            default: true,
        }).reply(200, expected);

        const updateResp = await client.v2.vpcs.byVpc_id("5a4981aa-9653-4bd1-bef5-d6bff52042e4").put({
            name: "env.prod-vpc",
            description: "VPC for production environment",
            defaultEscaped: true,
        });

        expect(updateResp).toEqual(typeExpected);
    });

    it("should mock the VPC patch operation", async () => {
        const expected = {
            vpc: {
                name: "env.prod-vpc",
                description: "VPC for production environment",
                region: "nyc1",
                ip_range: "10.10.10.0/24",
                default: true,
                id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                urn: "do:droplet:13457723",
                created_at: "2020-03-13T19:20:47.442049222Z",
            },
        };

        const typeExpected = {
            vpc: {
                name: "env.prod-vpc",
                description: "VPC for production environment",
                region: "nyc1",
                ipRange: "10.10.10.0/24",
                defaultEscaped: true,
                id: "5a4981aa-9653-4bd1-bef5-d6bff52042e4",
                urn: "do:droplet:13457723",
                createdAt: new Date("2020-03-13T19:20:47.442049222Z"),
            },
        };

        nock(baseUrl).patch("/v2/vpcs/5a4981aa-9653-4bd1-bef5-d6bff52042e4", {
            name: "env.prod-vpc",
            description: "VPC for production environment",
            default: true,
        }).reply(200, expected);

        const patchResp = await client.v2.vpcs.byVpc_id("5a4981aa-9653-4bd1-bef5-d6bff52042e4").patch({
            name: "env.prod-vpc",
            description: "VPC for production environment",
            defaultEscaped: true,
        });

        expect(patchResp).toEqual(typeExpected);
    });

    it("should mock the VPC deletion operation", async () => {
        nock(baseUrl).delete("/v2/vpcs/5a4981aa-9653-4bd1-bef5-d6bff52042e4").reply(204);

        const delResp = await client.v2.vpcs.byVpc_id("5a4981aa-9653-4bd1-bef5-d6bff52042e4").delete();
        expect(delResp).toBeUndefined();
    });

    it("should mock the VPC list members operation", async () => {
        const expected = {
            members: [
                {
                    urn: "do:loadbalancer:fb294d78-d193-4cb2-8737-ea620993591b",
                    name: "nyc1-load-balancer-01",
                    created_at: "2020-03-13T19:30:48Z",
                },
                {
                    urn: "do:dbaas:13f7a2f6-43df-4c4a-8129-8733267ddeea",
                    name: "db-postgresql-nyc1-55986",
                    created_at: "2020-03-13T19:30:18Z",
                },
                {
                    urn: "do:kubernetes:da39d893-96e1-4e4d-971d-1fdda33a46b1",
                    name: "k8s-nyc1-1584127772221",
                    created_at: "2020-03-13T19:30:16Z",
                },
                {
                    urn: "do:droplet:86e29982-03a7-4946-8a07-a0114dff8754",
                    name: "ubuntu-s-1vcpu-1gb-nyc1-01",
                    created_at: "2020-03-13T19:29:20Z",
                },
            ],
            links: {},
            meta: { total: 4 },
        };
        const typeExpected = {
            members: [
                {
                    urn: "do:loadbalancer:fb294d78-d193-4cb2-8737-ea620993591b",
                    name: "nyc1-load-balancer-01",
                    createdAt: "2020-03-13T19:30:48Z",
                },
                {
                    urn: "do:dbaas:13f7a2f6-43df-4c4a-8129-8733267ddeea",
                    name: "db-postgresql-nyc1-55986",
                    createdAt: "2020-03-13T19:30:18Z",
                },
                {
                    urn: "do:kubernetes:da39d893-96e1-4e4d-971d-1fdda33a46b1",
                    name: "k8s-nyc1-1584127772221",
                    createdAt: "2020-03-13T19:30:16Z",
                },
                {
                    urn: "do:droplet:86e29982-03a7-4946-8a07-a0114dff8754",
                    name: "ubuntu-s-1vcpu-1gb-nyc1-01",
                    createdAt: "2020-03-13T19:29:20Z",
                },
            ],
            links: {},
            meta: { total: 4 },
        };

        nock(baseUrl).get("/v2/vpcs/1/members").reply(200, expected);

        const listResp = await client.v2.vpcs.byVpc_id("1").members.get();
        expect(listResp).toEqual(typeExpected);
    });
});