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
const REGION = "nyc3";
const PREFIX = "test-dots";
const DROPLET_SIZE = "s-1vcpu-1gb";
const DROPLET_IMAGE = "ubuntu-22-04-x64";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Monitoring Integration Tests", () => {
    let publicKey;
    beforeAll(async () => {
        const keyName = process.env.SSH_KEY_NAME;
        if (!keyName) {
            throw new Error("SSH_KEY_NAME not set");
        }
        const sshKey = await findSshKey(keyName);
        const fingerprint = sshKey.fingerprint ?? (() => { throw new Error("SSH key fingerprint is undefined or null"); })();
        publicKey = fingerprint;
    });
    it("should create, list, get, update, and delete an alert policy", async () => {
        const testDropletReq = {
            name: `${PREFIX}-${uuidv4()}`,
            region: REGION,
            size: DROPLET_SIZE,
            image: DROPLET_IMAGE,
            tags: ["cg_test_tag"],
            ssh_keys: [publicKey.toString()],
        };
        const droplet = await createDroplet(testDropletReq);
        try {
            await waitForDropletActive(droplet.id);
            const dropletGetResp = await getDroplet(droplet.id);
            expect(dropletGetResp.status).toBe("active");
            const dropletId = dropletGetResp.id;
            const createAlertReq = {
                alerts: {
                    email: ["mchittupolu@digitalocean.com"],
                },
                compare: "GreaterThan",
                description: "CPU Alert",
                enabled: true,
                entities: [dropletId.toString()],
                tags: ["cg_test_tag"],
                type: "v1/insights/droplet/cpu",
                value: 80,
                window: "5m",
            };
            const createAlertResp = await createAlertPolicy(createAlertReq);
            if (!createAlertResp?.policy?.entities) {
                throw new Error(`Policy entities not found`);
            }
            expect(createAlertResp.policy.entities[0]).toBe(dropletId.toString());
            const alertUuid = createAlertResp?.policy?.uuid;
            if (!alertUuid) {
                throw new Error(`Alert policy with ID ${alertUuid} not found`);
            }
            try {
                const alertPoliciesList = await listAlertPolicies();
                expect(alertPoliciesList.length).toBeGreaterThan(0);
                const getAlertPolicy = await getAlertPolicyById(alertUuid);
                if (!getAlertPolicy?.policy?.entities) {
                    throw new Error(`Alert entities with ID ${alertUuid} not found`);
                }
                expect(getAlertPolicy?.policy?.entities[0]).toBe(dropletId.toString());
                const updateAlertReq = {
                    alerts: {
                        email: ["mchittupolu@digitalocean.com"],
                    },
                    compare: "GreaterThan",
                    description: "CPU Alert",
                    enabled: true,
                    tags: ["cg_test_tag"],
                    type: "v1/insights/droplet/cpu",
                    value: 80,
                    window: "5m",
                };
                const updateAlertPolicy = await updateAlertPolicyById(alertUuid, updateAlertReq);
                if (!updateAlertPolicy?.policy?.alerts?.email) {
                    throw new Error(`Alert emaail with ID ${alertUuid} not found`);
                }
                expect(updateAlertPolicy.policy.alerts.email).toContain("mchittupolu@digitalocean.com");
                await deleteAlertPolicy(alertUuid);
            }
            catch (alertError) {
                try {
                    await deleteAlertPolicy(alertUuid);
                }
                catch (cleanupError) {
                    console.warn("Failed to clean up alert policy:", cleanupError);
                }
                throw alertError;
            }
        }
        finally {
            await deleteDroplet(droplet.id);
        }
    }, 120000);
    it("should get various metrics", async () => {
        const testDropletReq = {
            name: `${PREFIX}-${uuidv4()}`,
            region: REGION,
            size: DROPLET_SIZE,
            image: DROPLET_IMAGE,
            tags: ["cg_test_tag"],
            ssh_keys: [publicKey.toString()],
        };
        const droplet = await createDroplet(testDropletReq);
        try {
            await waitForDropletActive(droplet.id);
            const dropletGetResp = await getDroplet(droplet.id);
            expect(dropletGetResp.status).toBe("active");
            const dropletId = dropletGetResp.id;
            const endTime = Math.floor(Date.now() / 1000);
            const startTime = endTime - (6 * 60 * 60);
            const bandwidthMetric = await getDropletBandwidthMetrics(dropletId.toString(), "public", "outbound", startTime.toString(), endTime.toString());
            expect(bandwidthMetric.status).toBe("success");
            const cpuMetric = await getDropletCpuMetrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(cpuMetric.status).toBe("success");
            const filesystemFreeMetric = await getDropletFilesystemFreeMetrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(filesystemFreeMetric.status).toBe("success");
            const load1Metric = await getDropletLoad1Metrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(load1Metric.status).toBe("success");
            const load5Metric = await getDropletLoad5Metrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(load5Metric.status).toBe("success");
            const load15Metric = await getDropletLoad15Metrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(load15Metric.status).toBe("success");
            const memoryCachedMetric = await getDropletMemoryCachedMetrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(memoryCachedMetric.status).toBe("success");
            const memoryFreeMetric = await getDropletMemoryFreeMetrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(memoryFreeMetric.status).toBe("success");
            const memoryTotalMetric = await getDropletMemoryTotalMetrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(memoryTotalMetric.status).toBe("success");
            const memoryAvailableMetric = await getDropletMemoryAvailableMetrics(dropletId.toString(), startTime.toString(), endTime.toString());
            expect(memoryAvailableMetric.status).toBe("success");
        }
        finally {
            await deleteDroplet(droplet.id);
        }
    }, 120000);
    async function findSshKey(name) {
        console.log(`Looking for SSH key named ${name}...`);
        let paginated = true;
        while (paginated) {
            try {
                const resp = await client.v2.account.keys.get();
                if (resp && resp.sshKeys) {
                    for (const k of resp.sshKeys) {
                        if (k.name === name) {
                            console.log(`Found SSH key: ${k.fingerprint}`);
                            return k;
                        }
                    }
                    const pages = resp.links?.pages;
                    if (pages && 'next' in pages) {
                        const nextUrl = pages.next;
                        if (nextUrl) {
                            const parsedUrl = new URL(nextUrl);
                            const nextPage = parseInt(parsedUrl.searchParams.get("page"));
                            console.log(`Next page: ${nextPage}`);
                        }
                        else {
                            paginated = false;
                        }
                    }
                    else {
                        console.log("No next page available");
                        paginated = false;
                    }
                }
                else {
                    throw new Error("Failed to retrieve SSH keys");
                }
            }
            catch (err) {
                console.error(`Error: ${err}`);
                throw err;
            }
        }
        throw new Error("No SSH key found");
    }
    async function createDroplet(req) {
        console.log(`Creating Droplet using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.droplets.post(req);
            if (resp && 'droplet' in resp) {
                const dropletId = resp.droplet?.id;
                if (dropletId) {
                    const droplet = await waitForDropletNetworks(dropletId);
                    return droplet;
                }
                else {
                    throw new Error("Droplet ID is undefined");
                }
            }
            else {
                throw new Error("Failed to create droplet");
            }
        }
        catch (err) {
            handleError(err);
        }
    }
    async function waitForDropletNetworks(dropletId) {
        let attempts = 0;
        const maxAttempts = 10;
        const delay = 5000;
        while (attempts < maxAttempts) {
            const getResp = await client.v2.droplets.byDroplet_id(dropletId).get();
            if (getResp && 'droplet' in getResp) {
                const droplet = getResp.droplet;
                if (droplet?.networks && droplet.networks.v4 && droplet.networks.v4.length > 0) {
                    return {
                        id: droplet.id,
                        name: droplet.name,
                        region: droplet.region,
                        size: droplet.size,
                        image: droplet.image,
                        status: droplet.status,
                        networks: {
                            v4: (droplet.networks?.v4
                                ?.filter((net) => typeof net.ipAddress === "string" && !!net.type)
                                .map((net) => ({
                                ip_address: net.ipAddress,
                                type: net.type,
                            }))) ?? [],
                        },
                    };
                }
            }
            attempts++;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error("Failed to retrieve droplet details or networks information");
    }
    async function waitForDropletActive(dropletId) {
        console.log(`Waiting for droplet ${dropletId} to become active...`);
        let attempts = 0;
        const maxAttempts = 20;
        const delay = 5000;
        while (attempts < maxAttempts) {
            const resp = await client.v2.droplets.byDroplet_id(dropletId).get();
            if (resp && resp.droplet && resp.droplet.status === "active") {
                console.log(`Droplet ${dropletId} is now active`);
                return;
            }
            attempts++;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error(`Droplet ${dropletId} did not become active within timeout`);
    }
    async function getDroplet(dropletId) {
        try {
            const resp = await client.v2.droplets.byDroplet_id(dropletId).get();
            if (resp && resp.droplet) {
                const droplet = resp.droplet;
                return {
                    id: droplet.id,
                    name: droplet.name,
                    region: droplet.region,
                    size: droplet.size,
                    image: droplet.image,
                    status: droplet.status,
                    networks: {
                        v4: (droplet.networks?.v4
                            ?.filter((net) => typeof net.ipAddress === "string" && !!net.type)
                            .map((net) => ({
                            ip_address: net.ipAddress,
                            type: net.type,
                        }))) ?? [],
                    },
                };
            }
            else {
                throw new Error("Failed to get droplet");
            }
        }
        catch (err) {
            handleError(err);
        }
    }
    async function deleteDroplet(dropletId) {
        console.log(`Deleting droplet: ${dropletId}`);
        try {
            await client.v2.droplets.byDroplet_id(dropletId).delete();
        }
        catch (err) {
            handleError(err);
        }
    }
    async function createAlertPolicy(req) {
        console.log(`Creating alert policy: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.monitoring.alerts.post(req);
            if (resp && resp.policy) {
                console.log(resp);
                return resp;
            }
            else {
                throw new Error("Failed to create alert policy");
            }
        }
        catch (err) {
            handleError(err);
        }
    }
    async function listAlertPolicies() {
        try {
            const resp = await client.v2.monitoring.alerts.get();
            if (resp && resp.policies) {
                return resp.policies;
            }
            else {
                return [];
            }
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getAlertPolicyById(alertUuid) {
        try {
            const resp = await client.v2.monitoring.alerts.byAlert_uuid(alertUuid).get();
            if (resp && resp.policy) {
                return resp;
            }
            else {
                throw new Error("Failed to get alert policy");
            }
        }
        catch (err) {
            handleError(err);
        }
    }
    async function updateAlertPolicyById(alertUuid, req) {
        console.log(`Updating alert policy: ${alertUuid}`);
        try {
            const resp = await client.v2.monitoring.alerts.byAlert_uuid(alertUuid).put(req);
            if (resp && resp.policy) {
                return resp;
            }
            else {
                throw new Error("Failed to update alert policy");
            }
        }
        catch (err) {
            handleError(err);
        }
    }
    async function deleteAlertPolicy(alertUuid) {
        console.log(`Deleting alert policy: ${alertUuid}`);
        try {
            await client.v2.monitoring.alerts.byAlert_uuid(alertUuid).delete();
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletBandwidthMetrics(hostId, interfaceType, direction, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.bandwidth.get({
                queryParameters: {
                    hostId: hostId,
                    interface: interfaceType,
                    direction: direction,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletCpuMetrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.cpu.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletFilesystemFreeMetrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.filesystem_free.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletLoad1Metrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.load_1.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletLoad5Metrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.load_5.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletLoad15Metrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.load_15.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletMemoryCachedMetrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.memory_cached.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletMemoryFreeMetrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.memory_free.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletMemoryTotalMetrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.memory_total.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    async function getDropletMemoryAvailableMetrics(hostId, start, end) {
        try {
            const resp = await client.v2.monitoring.metrics.droplet.memory_available.get({
                queryParameters: {
                    hostId: hostId,
                    start: start,
                    end: end
                }
            });
            return { status: resp?.status || "success", data: resp };
        }
        catch (err) {
            handleError(err);
        }
    }
    function handleError(err) {
        if (err instanceof Error && 'statusCode' in err) {
            const httpError = err;
            throw new Error(`Error: ${httpError.statusCode} ${httpError.message}: ${httpError.response?.bodyAsText}`);
        }
        else {
            throw err;
        }
    }
});
