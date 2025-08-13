import { v4 as uuidv4 } from 'uuid';
import { createDigitalOceanClient } from '../../src/dots/digitalOceanClient.js';
import { DigitalOceanApiKeyAuthenticationProvider } from '../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js';
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary';
import dotenv from "dotenv";
dotenv.config();
const defaults = {
    PREFIX: 'dots-test',
    REGION: 'nyc3',
    K8S_VERSION: '1.33.1-do.2',
    K8S_NODE_SIZE: 's-2vcpu-2gb'
};
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(process.env.DIGITALOCEAN_TOKEN);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
async function createTestCluster(client, name) {
    return await client.v2.kubernetes.clusters.post({
        name,
        region: defaults.REGION,
        version: defaults.K8S_VERSION,
        nodePools: [
            {
                size: defaults.K8S_NODE_SIZE,
                count: 2,
                name: 'workers'
            }
        ]
    });
}
async function waitForClusterRunning(client, clusterId, maxWaitTime = 900000, pollInterval = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
        try {
            console.log(`at 49`);
            const cluster = await client.v2.kubernetes.clusters.byCluster_id(clusterId).get();
            console.log(`at 50`);
            if (cluster?.kubernetesCluster?.status?.state === 'running') {
                return cluster;
            }
            console.log(`Cluster ${clusterId} status: ${cluster?.kubernetesCluster?.status?.state}, waiting...`);
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        catch (error) {
            console.warn(`Error checking cluster status: ${error}`);
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }
    throw new Error(`Cluster ${clusterId} did not reach running state within ${maxWaitTime}ms`);
}
async function deleteCluster(client, clusterId) {
    try {
        await client.v2.kubernetes.clusters.byCluster_id(clusterId).delete();
        console.log(`Cleaned up cluster ${clusterId}`);
    }
    catch (error) {
        console.warn(`Failed to clean up cluster ${clusterId}:`, error);
    }
}
describe('One-clicks Integration Tests', () => {
    it('should install kubernetes app via one-click', async () => {
        const clusterName = `${defaults.PREFIX}-cluster-${uuidv4()}`;
        let clusterId;
        try {
            // Create cluster
            const cluster = await createTestCluster(client, clusterName);
            if (!cluster?.kubernetesCluster?.id) {
                throw new Error(`Id not found`);
            }
            clusterId = cluster?.kubernetesCluster?.id;
            if (!clusterId) {
                throw new Error('Failed to create cluster');
            }
            await waitForClusterRunning(client, clusterId);
            const installResp = await client.v2.oneClicks.kubernetes.post({
                addonSlugs: ['kube-state-metrics', 'loki'],
                clusterUuid: clusterId
            });
            expect(installResp).not.toBeNull();
            expect(installResp?.message).toBe('Successfully kicked off addon job.');
        }
        finally {
            if (clusterId) {
                await deleteCluster(client, clusterId);
            }
        }
    }, 1000000);
});
