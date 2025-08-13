/**
 * Mock tests for the Projects
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
describe("Projects API Mock Tests", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should list projects", async () => {
        const expected = {
            "projects": [
                {
                    "id": "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                    "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                    "owner_id": 258992,
                    "name": "my-web-api",
                    "description": "My website API",
                    "purpose": "Service or API",
                    "environment": "Production",
                    "is_default": false,
                    "created_at": "2018-09-27T20:10:35Z",
                    "updated_at": "2018-09-27T20:10:35Z",
                },
                {
                    "id": "addb4547-6bab-419a-8542-76263a033cf6",
                    "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                    "owner_id": 258992,
                    "name": "Default",
                    "description": "Default project",
                    "purpose": "Just trying out DigitalOcean",
                    "environment": "Development",
                    "is_default": true,
                    "created_at": "2017-10-19T21:44:20Z",
                    "updated_at": "2019-11-05T18:50:03Z",
                },
            ],
            "links": {
                "pages": {
                    "first": "https://api.digitalocean.com/v2/projects?page=1",
                    "last": "https://api.digitalocean.com/v2/projects?page=1",
                }
            },
            "meta": { "total": 2 },
        };
        const typeExpected = {
            projects: [
                {
                    id: "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                    ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                    ownerId: 258992,
                    name: "my-web-api",
                    description: "My website API",
                    purpose: "Service or API",
                    environment: "Production",
                    isDefault: false,
                    createdAt: new Date("2018-09-27T20:10:35Z"),
                    updatedAt: new Date("2018-09-27T20:10:35Z"),
                },
                {
                    id: "addb4547-6bab-419a-8542-76263a033cf6",
                    ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                    ownerId: 258992,
                    name: "Default",
                    description: "Default project",
                    purpose: "Just trying out DigitalOcean",
                    environment: "Development",
                    isDefault: true,
                    createdAt: new Date("2017-10-19T21:44:20Z"),
                    updatedAt: new Date("2019-11-05T18:50:03Z"),
                },
            ],
            links: {
                pages: {
                    first: "https://api.digitalocean.com/v2/projects?page=1",
                    additionalData: {
                        last: "https://api.digitalocean.com/v2/projects?page=1",
                    }
                }
            },
            meta: { total: 2 },
        };
        nock(baseUrl).get("/v2/projects").reply(200, expected);
        const listResp = await client.v2.projects.get();
        expect(listResp).toStrictEqual(typeExpected);
    });
    it("should list projects with pagination", async () => {
        const expected = {
            "projects": [
                {
                    "id": "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                    "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                    "owner_id": 258992,
                    "name": "my-web-api",
                    "description": "My website API",
                    "purpose": "Service or API",
                    "environment": "Production",
                    "is_default": false,
                    "created_at": "2018-09-27T20:10:35Z",
                    "updated_at": "2018-09-27T20:10:35Z",
                },
                {
                    "id": "addb4547-6bab-419a-8542-76263a033cf6",
                    "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                    "owner_id": 258992,
                    "name": "Default",
                    "description": "Default project",
                    "purpose": "Just trying out DigitalOcean",
                    "environment": "Development",
                    "is_default": true,
                    "created_at": "2017-10-19T21:44:20Z",
                    "updated_at": "2019-11-05T18:50:03Z",
                },
            ],
            "links": {
                "pages": {
                    "first": "https://api.digitalocean.com/v2/projects?page=2&per_page=20",
                    "last": "https://api.digitalocean.com/v2/projects?page=6&per_page=20",
                }
            },
            "meta": { "total": 6 },
        };
        const typeExpected = {
            projects: [
                {
                    id: "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                    ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                    ownerId: 258992,
                    name: "my-web-api",
                    description: "My website API",
                    purpose: "Service or API",
                    environment: "Production",
                    isDefault: false,
                    createdAt: new Date("2018-09-27T20:10:35Z"),
                    updatedAt: new Date("2018-09-27T20:10:35Z"),
                },
                {
                    id: "addb4547-6bab-419a-8542-76263a033cf6",
                    ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                    ownerId: 258992,
                    name: "Default",
                    description: "Default project",
                    purpose: "Just trying out DigitalOcean",
                    environment: "Development",
                    isDefault: true,
                    createdAt: new Date("2017-10-19T21:44:20Z"),
                    updatedAt: new Date("2019-11-05T18:50:03Z"),
                },
            ],
            links: {
                pages: {
                    first: "https://api.digitalocean.com/v2/projects?page=2&per_page=20",
                    additionalData: {
                        last: "https://api.digitalocean.com/v2/projects?page=6&per_page=20",
                    }
                }
            },
            meta: { total: 6 },
        };
        nock(baseUrl)
            .get("/v2/projects")
            .query({ per_page: 20, page: 1 })
            .reply(200, expected);
        const listResp = await client.v2.projects.get({
            queryParameters: {
                perPage: 20,
                page: 1
            }
        });
        expect(listResp).toStrictEqual(typeExpected);
    });
    it("should create a project", async () => {
        const createReq = {
            name: "my-web-api",
            description: "My website API",
            purpose: "Service or API",
            environment: "Production",
        };
        const createReqNock = {
            name: "my-web-api",
            description: "My website API",
            purpose: "Service or API",
            environment: "Production",
        };
        const expected = {
            "project": {
                "id": "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                "owner_id": 258992,
                "name": "my-web-api",
                "description": "My website API",
                "purpose": "Service or API",
                "environment": "Production",
                "created_at": "2018-09-27T20:10:35Z",
                "updated_at": "2018-09-27T20:10:35Z",
                "is_default": false,
            }
        };
        const typeExpected = {
            project: {
                id: "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                ownerId: 258992,
                name: "my-web-api",
                description: "My website API",
                purpose: "Service or API",
                environment: "Production",
                createdAt: new Date("2018-09-27T20:10:35Z"),
                updatedAt: new Date("2018-09-27T20:10:35Z"),
                isDefault: false,
            }
        };
        nock(baseUrl)
            .post("/v2/projects", createReqNock)
            .reply(201, expected);
        const createResp = await client.v2.projects.post(createReq);
        expect(createResp).toStrictEqual(typeExpected);
    });
    it("should get a project by ID", async () => {
        const projectId = "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679";
        const expected = {
            "project": {
                "id": "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                "owner_id": 258992,
                "name": "my-web-api",
                "description": "My website API",
                "purpose": "Service or API",
                "environment": "Production",
                "created_at": "2018-09-27T20:10:35Z",
                "updated_at": "2018-09-27T20:10:35Z",
                "is_default": false,
            }
        };
        const typeExpected = {
            project: {
                id: "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                ownerId: 258992,
                name: "my-web-api",
                description: "My website API",
                purpose: "Service or API",
                environment: "Production",
                createdAt: new Date("2018-09-27T20:10:35Z"),
                updatedAt: new Date("2018-09-27T20:10:35Z"),
                isDefault: false,
            }
        };
        nock(baseUrl)
            .get(`/v2/projects/${projectId}`)
            .reply(200, expected);
        const getResp = await client.v2.projects.byProject_id(projectId).get();
        expect(getResp).toStrictEqual(typeExpected);
    });
    it("should delete a project", async () => {
        const projectId = "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679";
        nock(baseUrl)
            .delete(`/v2/projects/${projectId}`)
            .reply(204);
        const delResp = await client.v2.projects.byProject_id(projectId).delete();
        expect(delResp).toBeUndefined();
    });
    it("should update a project", async () => {
        const projectId = "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679";
        const updateReq = {
            name: "my-web-api",
            description: "My website API",
            purpose: "Service or API",
            environment: "Production",
            isDefault: false,
        };
        const updateReqNock = {
            name: "my-web-api",
            description: "My website API",
            purpose: "Service or API",
            environment: "Production",
            is_default: false,
        };
        const expected = {
            "project": {
                "id": "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                "owner_id": 258992,
                "name": "my-web-api",
                "description": "My website API",
                "purpose": "Service or API",
                "environment": "Production",
                "created_at": "2018-09-27T20:10:35Z",
                "updated_at": "2018-09-27T20:10:35Z",
                "is_default": false,
            }
        };
        const typeExpected = {
            project: {
                id: "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                ownerId: 258992,
                name: "my-web-api",
                description: "My website API",
                purpose: "Service or API",
                environment: "Production",
                createdAt: new Date("2018-09-27T20:10:35Z"),
                updatedAt: new Date("2018-09-27T20:10:35Z"),
                isDefault: false,
            }
        };
        nock(baseUrl)
            .put(`/v2/projects/${projectId}`, updateReqNock)
            .reply(200, expected);
        const updateResp = await client.v2.projects.byProject_id(projectId).put(updateReq);
        expect(updateResp).toStrictEqual(typeExpected);
    });
    it("should patch a project", async () => {
        const projectId = "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679";
        const patchReq = {
            name: "my-web-api",
        };
        const expected = {
            "project": {
                "id": "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                "owner_id": 258992,
                "name": "my-web-api",
                "description": "My website API",
                "purpose": "Service or API",
                "environment": "Production",
                "created_at": "2018-09-27T20:10:35Z",
                "updated_at": "2018-09-27T20:10:35Z",
                "is_default": false,
            }
        };
        const typeExpected = {
            project: {
                id: "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                ownerId: 258992,
                name: "my-web-api",
                description: "My website API",
                purpose: "Service or API",
                environment: "Production",
                createdAt: new Date("2018-09-27T20:10:35Z"),
                updatedAt: new Date("2018-09-27T20:10:35Z"),
                isDefault: false,
            }
        };
        nock(baseUrl)
            .patch(`/v2/projects/${projectId}`, patchReq)
            .reply(200, expected);
        const patchResp = await client.v2.projects.byProject_id(projectId).patch(patchReq);
        expect(patchResp).toStrictEqual(typeExpected);
    });
    it("should get the default project", async () => {
        const expected = {
            "project": {
                "id": "addb4547-6bab-419a-8542-76263a033cf6",
                "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                "owner_id": 258992,
                "name": "Default",
                "description": "Default project",
                "purpose": "Just trying out DigitalOcean",
                "environment": "Development",
                "is_default": true,
                "created_at": "2017-10-19T21:44:20Z",
                "updated_at": "2019-11-05T18:50:03Z",
            }
        };
        const typeExpected = {
            project: {
                id: "addb4547-6bab-419a-8542-76263a033cf6",
                ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                ownerId: 258992,
                name: "Default",
                description: "Default project",
                purpose: "Just trying out DigitalOcean",
                environment: "Development",
                isDefault: true,
                createdAt: new Date("2017-10-19T21:44:20Z"),
                updatedAt: new Date("2019-11-05T18:50:03Z"),
            }
        };
        nock(baseUrl)
            .get("/v2/projects/default")
            .reply(200, expected);
        const getResp = await client.v2.projects.defaultEscaped.get();
        expect(getResp).toStrictEqual(typeExpected);
    });
    it("should update the default project", async () => {
        const UpdateReq = {
            name: "my-web-api",
            description: "My website API",
            purpose: "Service or API",
            environment: "Production",
            isDefault: false,
        };
        const UpdateReqNock = {
            name: "my-web-api",
            description: "My website API",
            purpose: "Service or API",
            environment: "Production",
            is_default: false,
        };
        const expected = {
            "project": {
                "id": "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                "owner_id": 258992,
                "name": "my-web-api",
                "description": "My website API",
                "purpose": "Service or API",
                "environment": "Production",
                "created_at": "2018-09-27T20:10:35Z",
                "updated_at": "2018-09-27T20:10:35Z",
                "is_default": false,
            }
        };
        const typeExpected = {
            project: {
                id: "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                ownerId: 258992,
                name: "my-web-api",
                description: "My website API",
                purpose: "Service or API",
                environment: "Production",
                createdAt: new Date("2018-09-27T20:10:35Z"),
                updatedAt: new Date("2018-09-27T20:10:35Z"),
                isDefault: false,
            }
        };
        nock(baseUrl)
            .put("/v2/projects/default", UpdateReqNock)
            .reply(200, expected);
        const updateResp = await client.v2.projects.defaultEscaped.put(UpdateReq);
        expect(updateResp).toStrictEqual(typeExpected);
    });
    it("should patch the default project", async () => {
        const patchReq = {
            name: "my-web-api",
        };
        const expected = {
            "project": {
                "id": "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                "owner_uuid": "99525febec065ca37b2ffe4f852fd2b2581895e7",
                "owner_id": 258992,
                "name": "my-web-api",
                "description": "My website API",
                "purpose": "Service or API",
                "environment": "Production",
                "created_at": "2018-09-27T20:10:35Z",
                "updated_at": "2018-09-27T20:10:35Z",
                "is_default": false,
            }
        };
        const typeExpected = {
            project: {
                id: "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679",
                ownerUuid: "99525febec065ca37b2ffe4f852fd2b2581895e7",
                ownerId: 258992,
                name: "my-web-api",
                description: "My website API",
                purpose: "Service or API",
                environment: "Production",
                createdAt: new Date("2018-09-27T20:10:35Z"),
                updatedAt: new Date("2018-09-27T20:10:35Z"),
                isDefault: false,
            }
        };
        nock(baseUrl)
            .patch("/v2/projects/default", patchReq)
            .reply(200, expected);
        const updateResp = await client.v2.projects.defaultEscaped.patch(patchReq);
        expect(updateResp).toStrictEqual(typeExpected);
    });
});
