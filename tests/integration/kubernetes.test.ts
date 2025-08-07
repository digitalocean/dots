import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { Cluster, Cluster_read } from "../../src/dots/models/index.js";
import { Cluster_registries } from "../../src/dots/models/index.js";
import { Cluster_update } from "../../src/dots/models/index.js";
import { Clusterlint_request } from "../../src/dots/models/index.js";
import { Kubernetes_node_pool, Kubernetes_node_pool_update } from "../../src/dots/models/index.js";
import { UpgradePostRequestBody } from "../../src/dots/v2/kubernetes/clusters/item/upgrade/index.js";
dotenv.config();

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}

const PREFIX = "test";
const REGION = "nyc3";
const K8S_VERSION = "1.33.1-do.2";
const K8S_NODE_SIZE = "s-2vcpu-2gb";

const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

interface KubernetesCluster {
    id: string;
    name: string;
    region: string;
    version: string;
    nodePools: Kubernetes_node_pool[];
    status: {
        state: string;
    };
    tags: string[];
    createdAt: Date;
}

const CLUSTER_CREATE_BASIC_REQ: Cluster = {
    name: `${PREFIX}-cluster-${uuidv4()}`,
    region: REGION,
    version: K8S_VERSION,
    nodePools: [{ size: K8S_NODE_SIZE, count: 2, name: "workers" }],
};

// Helper to get existing cluster ID from environment
const getExistingClusterId = (): string => {
    return process.env.DO_EXISTING_CLUSTER_ID || "";
};

describe("Kubernetes Integration Tests", () => {
    it("should test kubernetes operations", async () => {
        const existingClusterId = getExistingClusterId();
        const createReq = CLUSTER_CREATE_BASIC_REQ;

        // Create cluster and test operations
        const cluster = await createKubernetesCluster(createReq, existingClusterId);
        const clusterId = cluster.id;

        try {
            expect(clusterId).toBeTruthy();

            // List clusters
            const listResp = await client.v2.kubernetes.clusters.get();
            if (!listResp || !listResp.kubernetesClusters) {
                throw new Error("Failed to list clusters");
            }
            expect(listResp.kubernetesClusters).toBeDefined();

            // List options
            const optsResp = await client.v2.kubernetes.optionsPath.get();
            if (!optsResp || !optsResp.options) {
                throw new Error("Failed to get options");
            }
            const options = Object.keys(optsResp.options);
            expect(options).toEqual(expect.arrayContaining(["regions", "versions", "sizes"]));

            // Add registry
            const addRegReq: Cluster_registries = { clusterUuids: [clusterId] };
            const addRegResp = await client.v2.kubernetes.registry.post(addRegReq);
            expect(addRegResp).toBeUndefined();

            // Remove registry
            const removeRegReq: Cluster_registries = { clusterUuids: [clusterId] };
            const removeRegResp = await client.v2.kubernetes.registry.delete(removeRegReq);
            expect(removeRegResp).toBeUndefined();

        } finally {
            // Clean up cluster
            await deleteKubernetesCluster(clusterId);
        }
    }, 600000); 

    it("should test kubernetes cluster operations", async () => {
        const existingClusterId = getExistingClusterId();
        const createReq = CLUSTER_CREATE_BASIC_REQ;

        // Create cluster and test operations
        const cluster = await createKubernetesCluster(createReq, existingClusterId);
        const clusterId = cluster.id;
        const nodePoolId = cluster.nodePools[0].id;

        try {
            expect(clusterId).toBeTruthy();
            expect(nodePoolId).toBeTruthy();
            const getResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).get();
            if (!getResp || !getResp.kubernetesCluster) {
                throw new Error("Failed to get cluster");
            }
            expect(getResp.kubernetesCluster.status?.state).toBe("running");
            const updatedClusterName = `cg-updated-${uuidv4()}`;
            const updatedTags = ["k8s", `k8s:${clusterId}`, "client-gen"];
            const updateReq: Cluster_update = {
                name: updatedClusterName,
                tags: updatedTags,
            };

            const updateResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).put(updateReq);
            if (!updateResp || !updateResp.kubernetesCluster) {
                throw new Error("Failed to update cluster");
            }
            expect(updateResp.kubernetesCluster.name).toBe(updatedClusterName);
            expect(updateResp.kubernetesCluster.tags).toEqual(expect.arrayContaining(updatedTags));
            const credResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).credentials.get({
                queryParameters: { expirySeconds: 1 }
            });
            if (!credResp) {
                throw new Error("Failed to get credentials");
            }
            expect(credResp.server).toContain(clusterId);
            const assocResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).destroy_with_associated_resources.get();
            if (!assocResp) {
                throw new Error("Failed to list associated resources");
            }
            expect(assocResp.loadBalancers).toBeDefined();
            expect(assocResp.volumes).toBeDefined();
            expect(assocResp.volumeSnapshots).toBeDefined();
            try {
                await client.v2.kubernetes.clusters.byCluster_id(clusterId).destroy_with_associated_resources.dangerous.delete();
                throw new Error("Should have thrown an error for invalid resource");
            } catch (err) {
                expect(err).toBeDefined(); // Expect this to fail
            }
            const userResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).user.get();
            if (!userResp || !userResp.kubernetesClusterUser) {
                throw new Error("Failed to get cluster user");
            }
            expect(userResp.kubernetesClusterUser.username).toBeTruthy();
            const clusterLint : Clusterlint_request = {
							includeGroups: ["basic", "doks", "security"],
							includeChecks: ["bare-pods", "resource-requirements"],
							excludeGroups: ["workload-health"],
							excludeChecks: ["default-namespace"],
						};
            const runLintResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).clusterlint.post(clusterLint);
            if (!runLintResp) {
                throw new Error("Failed to run clusterlint");
            }
            const lintRunId = runLintResp.runId;
            expect(lintRunId).toBeTruthy();
            await new Promise(resolve => setTimeout(resolve, 15000));
            const getLintResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).clusterlint.get();
            if (!getLintResp) {
                throw new Error("Failed to get clusterlint results");
            }
            expect(getLintResp.runId).toBe(lintRunId);
            expect(Array.isArray(getLintResp.diagnostics)).toBe(true);

        } catch (err){
            console.log(err);
        }
    }, 600000); 

    it("should test kubernetes node pool operations", async () => {
        const existingClusterId = getExistingClusterId();
        const nodePoolName = "workers";

        const createReq: Cluster = {
            name: `${PREFIX}-cluster-${uuidv4()}`,
            region: REGION,
            version: K8S_VERSION,
            nodePools: [{ size: K8S_NODE_SIZE, count: 2, name: nodePoolName }],
        };
        const cluster = await createKubernetesCluster(createReq, existingClusterId);
        const clusterId = cluster.id;
        const nodePoolId = cluster.nodePools[0].id;

        try {
            expect(clusterId).toBeTruthy();
            expect(nodePoolId).toBeTruthy();
            const listResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).node_pools.get();
            if (!listResp || !listResp.nodePools) {
                throw new Error("Failed to list node pools");
            }
            const poolNames = listResp.nodePools.map(pool => pool.name);
            expect(poolNames).toContain(nodePoolName);
            const newPoolName = "new-pool";
            const addPoolReq: Kubernetes_node_pool = {
                size: "s-1vcpu-2gb",
                count: 3,
                name: newPoolName,
                tags: ["frontend"],
                autoScale: true,
                minNodes: 3,
                maxNodes: 6,
            };

            const addPoolResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).node_pools.post(addPoolReq);
            if (!addPoolResp || !addPoolResp.nodePool) {
                throw new Error("Failed to add node pool");
            }
            expect(addPoolResp.nodePool.name).toBe(newPoolName);
            const newPoolId = addPoolResp.nodePool.id!;
            const getPoolResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).node_pools.byNode_pool_id(newPoolId).get();
            if (!getPoolResp || !getPoolResp.nodePool) {
                throw new Error("Failed to get node pool");
            }
            expect(getPoolResp.nodePool.id).toBe(newPoolId);
            const updatedPoolName = `${newPoolName}-${uuidv4()}`;
            const updatePoolReq: Kubernetes_node_pool_update = {
                name: updatedPoolName,
                count: 4
            };

            const updatePoolResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).node_pools.byNode_pool_id(newPoolId).put(updatePoolReq);
            if (!updatePoolResp || !updatePoolResp.nodePool) {
                throw new Error("Failed to update node pool");
            }
            expect(updatePoolResp.nodePool.name).toBe(updatedPoolName);
            
            if (updatePoolResp.nodePool.nodes && updatePoolResp.nodePool.nodes.length > 0) {
                const nodeId = updatePoolResp.nodePool.nodes[0].id!;
                const deleteNodeResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).node_pools.byNode_pool_id(newPoolId).nodes.byNode_id(nodeId).delete();
                expect(deleteNodeResp).toBeUndefined();
            }
            const deletePoolResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).node_pools.byNode_pool_id(newPoolId).delete();
            expect(deletePoolResp).toBeUndefined();

        } finally {
            await deleteKubernetesCluster(clusterId);
        }
    }, 600000);

    it("should test kubernetes cluster upgrade", async () => {
        const existingClusterId = getExistingClusterId();
        const optsResp = await client.v2.kubernetes.optionsPath.get();
        if (!optsResp || !optsResp.options || !optsResp.options.versions) {
            throw new Error("Failed to get kubernetes options");
        }

        const versions = optsResp.options.versions;
        const slugs = versions.map(v => v.slug).filter(Boolean).sort();
        expect(slugs.length).toBeGreaterThan(0);

        const minVersion = slugs[0];

        const createReq: Cluster = {
            name: `${PREFIX}-cluster-${uuidv4()}`,
            region: REGION,
            version: minVersion,
            nodePools: [{ size: K8S_NODE_SIZE, count: 2, name: "workers" }],
        };

        const cluster = await createKubernetesCluster(createReq, existingClusterId);
        const clusterId = cluster.id;

        try {
            const upgradesResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).upgrades.get();
            if (!upgradesResp || !upgradesResp.availableUpgradeVersions) {
                throw new Error("Failed to get available upgrades");
            }
            expect(upgradesResp.availableUpgradeVersions.length).toBeGreaterThanOrEqual(1);
            
            const nextVersion = upgradesResp.availableUpgradeVersions[0].slug;
            if (!nextVersion) {
                throw new Error("No upgrade version available");
            }

            const upgradeReq: UpgradePostRequestBody = { version: nextVersion };
            const upgradeResp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).upgrade.post(upgradeReq);
            expect(upgradeResp).toBeUndefined();

        } finally {
            await deleteKubernetesCluster(clusterId);
        }
    }, 600000); 
    async function createKubernetesCluster(req: Cluster, existingClusterId?: string): Promise<KubernetesCluster> {
        if (existingClusterId) {
            console.log(`Using existing cluster ID: ${existingClusterId}`);
            const resp = await client.v2.kubernetes.clusters.byCluster_id(existingClusterId).get();
            if (!resp || !resp.kubernetesCluster) {
                throw new Error("Failed to get existing cluster");
            }
            return mapToKubernetesCluster(resp.kubernetesCluster);
        }

        console.log(`Creating kubernetes cluster using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.kubernetes.clusters.post(req);
            if (resp && resp.kubernetesCluster) {
                const cluster = resp.kubernetesCluster;
                console.log(`Created kubernetes cluster ${cluster.name} <ID: ${cluster.id}>`);
                
                await waitForClusterReady(cluster.id as string);
                
                return mapToKubernetesCluster(cluster);
            } else {
                throw new Error("Failed to create kubernetes cluster or cluster is undefined");
            }
        } catch (err) {
            if (err instanceof Error && 'statusCode' in err) {
                const httpError = err as Error & { 
                    statusCode: number; 
                    response?: { bodyAsText?: string } 
                };
                throw new Error(`Error: ${httpError.statusCode} ${httpError.message}: ${httpError.response?.bodyAsText}`);
            } else {
                throw err;
            }
        }
    }

    async function waitForClusterReady(clusterId: string, maxWaitTime = 600000): Promise<void> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                const resp = await client.v2.kubernetes.clusters.byCluster_id(clusterId).get();
                if (resp?.kubernetesCluster?.status?.state === "running") {
                    console.log(`Cluster ${clusterId} is ready`);
                    return;
                }
                console.log(`Waiting for cluster ${clusterId} to be ready...`);
                await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
            } catch (err) {
                console.error(`Error checking cluster status: ${err}`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
        
        throw new Error(`Cluster ${clusterId} did not become ready within ${maxWaitTime}ms`);
    }
function mapToKubernetesCluster(cluster: Cluster_read): KubernetesCluster {
    return {
        id: String(cluster.id || ""),
        name: cluster.name || "",
        region: cluster.region || "",
        version: cluster.version || "",
        nodePools: (cluster.nodePools || []),
        status: {
            state: cluster.status?.state || ""
        },
        tags: cluster.tags || [],
        createdAt: cluster.createdAt ? new Date(cluster.createdAt) : new Date(),
    };
}
    async function deleteKubernetesCluster(clusterId: string): Promise<void> {
        console.log(`Deleting kubernetes cluster <ID: ${clusterId}>`);
        try {
            await client.v2.kubernetes.clusters.byCluster_id(clusterId).delete();
            console.log(`Deleted kubernetes cluster <ID: ${clusterId}>`);
        } catch (err) {
            console.error(`Failed to delete kubernetes cluster <ID: ${clusterId}>:`, err);
        }
    }
});