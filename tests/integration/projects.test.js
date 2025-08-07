/**
 * Integration Tests for Projects
 */
import { v4 as uuidv4 } from 'uuid';
import { createDigitalOceanClient } from '../../src/dots/digitalOceanClient.js';
import { DigitalOceanApiKeyAuthenticationProvider } from '../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js';
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary';
import { defaults } from './defaults.js';
import dotenv from "dotenv";
dotenv.config();
const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe('Projects Integration Tests', () => {
    it('should create, update, patch, list, and delete a project', async () => {
        const expectedName = `${defaults.PREFIX}-${uuidv4()}`;
        const createReq = {
            name: expectedName,
            description: "Test project for typescript client",
            purpose: "testing",
            environment: "Development",
        };
        const createResp = await client.v2.projects.post(createReq);
        expect(createResp?.project?.name).toBe(expectedName);
        const projectId = createResp?.project?.id;
        expect(projectId).toBeDefined();
        try {
            const getResp = await client.v2.projects.byProject_id(projectId).get();
            expect(getResp?.project?.name).toBe(expectedName);
            const updatedName = `${defaults.PREFIX}-${uuidv4()}`;
            const updateReq = {
                name: updatedName,
                description: "Test project for typescript client",
                purpose: "testing",
                environment: "Development",
                isDefault: false,
            };
            const updateResp = await client.v2.projects.byProject_id(projectId).put(updateReq);
            expect(updateResp?.project?.name).toBe(updatedName);
            const patchName = `${defaults.PREFIX}-${uuidv4()}`;
            const patchReq = {
                name: patchName,
            };
            const patchResp = await client.v2.projects.byProject_id(projectId).patch(patchReq);
            expect(patchResp?.project?.name).toBe(patchName);
            const listResp = await client.v2.projects.get();
            expect(listResp?.projects?.length).toBeGreaterThan(0);
        }
        finally {
            const deleteResp = await client.v2.projects.byProject_id(projectId).delete({
                headers: {
                    "Content-Type": "application/json"
                }
            });
            expect(deleteResp).toBeUndefined();
        }
    }, 60000);
    it('should get, update, and patch the default project', async () => {
        const getResp = await client.v2.projects.defaultEscaped.get();
        expect(getResp?.project?.isDefault).toBe(true);
        const originalName = getResp?.project?.name;
        try {
            const expectedName = `${defaults.PREFIX}-${uuidv4()}`;
            const updateReq = {
                name: expectedName,
                description: "Test project for typescript client",
                purpose: "testing",
                environment: "Development",
                isDefault: true,
            };
            const updateResp = await client.v2.projects.defaultEscaped.put(updateReq);
            expect(updateResp?.project?.name).toBe(expectedName);
            expect(updateResp?.project?.isDefault).toBe(true);
            const patchName = `${defaults.PREFIX}-${uuidv4()}`;
            const patchReq = {
                name: patchName,
            };
            const patchResp = await client.v2.projects.defaultEscaped.patch(patchReq);
            expect(patchResp?.project?.name).toBe(patchName);
            expect(patchResp?.project?.isDefault).toBe(true);
        }
        finally {
            if (originalName) {
                try {
                    await client.v2.projects.defaultEscaped.patch({
                        name: originalName
                    });
                }
                catch (error) {
                    console.warn('Failed to restore original default project name:', error);
                }
            }
        }
    }, 60000);
});
describe('Projects Resource Management', () => {
    let testProjectId;
    beforeEach(async () => {
        const projectName = `${defaults.PREFIX}-resources-${uuidv4()}`;
        const createReq = {
            name: projectName,
            description: "Test project for resource management",
            purpose: "testing",
            environment: "Development",
        };
        const createResp = await client.v2.projects.post(createReq);
        if (!createResp?.project?.id) {
            throw new Error("Failed to create project or project ID is undefined");
        }
        testProjectId = createResp.project.id;
    });
    afterEach(async () => {
        if (testProjectId) {
            try {
                await client.v2.projects.byProject_id(testProjectId).delete({
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
            }
            catch (error) {
                console.warn(`Failed to clean up project ${testProjectId}:`, error);
            }
        }
    });
    it('should list project resources', async () => {
        const resourcesResp = await client.v2.projects.byProject_id(testProjectId).resources.get();
        expect(resourcesResp?.resources).toBeDefined();
        expect(Array.isArray(resourcesResp?.resources)).toBe(true);
    });
});
