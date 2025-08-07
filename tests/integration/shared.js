export const defaults = {
    PREFIX: 'dots-test',
    REGION: 'nyc3',
    K8S_VERSION: '1.33.1-do.2',
    K8S_NODE_SIZE: 's-2vcpu-2gb'
};
export const shared = {
    async withTestKubernetesCluster(client, clusterCreateReq, options = {}, callback) {
        const createResp = await client.v2.kubernetes.clusters.post(clusterCreateReq);
        console.log(`at 17`, createResp);
        const clusterId = createResp?.kubernetesCluster?.id;
        console.log(`cluster Id `, clusterId);
        if (!clusterId) {
            throw new Error('Failed to create cluster');
        }
        try {
            let cluster = createResp;
            if (options.wait) {
                console.log(`at 28`, cluster);
                cluster = await waitForClusterRunning(client, clusterId);
                console.log(`at 29`, clusterId);
            }
            return await callback(cluster);
        }
        finally {
            try {
                await client.v2.kubernetes.clusters.byCluster_id(clusterId).delete();
            }
            catch (error) {
                console.warn(`Failed to clean up cluster ${clusterId}:`, error);
            }
        }
    }
};
async function waitForClusterRunning(client, clusterId, maxWaitTime = 900000, pollInterval = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
        try {
            console.log(clusterId);
            const cluster = await client.v2.kubernetes.clusters.byCluster_id(clusterId).get();
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
