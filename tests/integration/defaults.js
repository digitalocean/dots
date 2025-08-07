export const defaults = {
    PREFIX: process.env.TEST_PREFIX || 'kiota-test',
    REGION: process.env.TEST_REGION || 'nyc3',
    K8S_VERSION: process.env.K8S_VERSION || '1.33.1-do.2',
    K8S_NODE_SIZE: process.env.K8S_NODE_SIZE || 's-2vcpu-2gb'
};
