import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { v4 as uuidv4 } from "uuid";
import { DatabasesPostRequestBody} from "../../src/dots/v2/databases/index.js";
import { Connection_pool , Connection_pool_update, Database_replica} from "../../src/dots/models/index.js";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}

const PREFIX = "test";
const REGION = "nyc3";

const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

interface DatabaseCluster {
    id: string;
    name: string;
    engine: string;
    version: string;
    region: string;
    size: string;
    numNodes: number;
    status: string;
}

describe("Database Integration Tests", () => {

    it("should update connection pool", async () => {
        const dbCreateReq: DatabasesPostRequestBody = {
            name: `${PREFIX}-${uuidv4()}`,
            engine: "pg",
            version: "14",
            region: REGION,
            size: "db-s-2vcpu-4gb",
            numNodes: 2,
            tags: ["production"],
        };
        const database: DatabaseCluster = await createDatabase(dbCreateReq);
        const dbId = database.id;
        try {
            await waitForDatabaseActive(dbId);

            const createPoolReq: Connection_pool = {
                name: `${PREFIX}-${uuidv4()}`,
                mode: "transaction",
                size: 10,
                db: "defaultdb",
                user: "doadmin",
            };
            const poolResp = await client.v2.databases.byDatabase_cluster_uuid(dbId).pools.post(createPoolReq);
            if (!poolResp || !poolResp.pool) {
                throw new Error("Failed to create connection pool");
            }
            expect(poolResp.pool).toBeDefined();
            const poolName = poolResp.pool.name as string;

            const newPoolMode = "session";
            const newPoolSize = 15;

            const updatePoolReq: Connection_pool_update = {
                mode: newPoolMode,
                size: newPoolSize,
                db: "defaultdb",
                user: "doadmin",
            };
            const updatePoolResp = await client.v2.databases.byDatabase_cluster_uuid(dbId).pools.byPool_name(poolName).put(updatePoolReq);
            expect(updatePoolResp).toBeUndefined();
            const poolDetails = await client.v2.databases.byDatabase_cluster_uuid(dbId).pools.byPool_name(poolName).get();
            if (!poolDetails || !poolDetails.pool) {
                throw new Error("Failed to get connection pool details");
            }
            expect(poolDetails.pool.mode).toBe(newPoolMode);
            expect(poolDetails.pool.size).toBe(newPoolSize);

        } finally {
            await deleteDatabase(dbId);
        }
    }, 600000);

    it("should update major version", async () => {
        const dbCreateReq: DatabasesPostRequestBody = {
            name: `${PREFIX}-${uuidv4()}`,
            engine: "pg",
            version: "16",
            region: REGION,
            size: "db-s-2vcpu-4gb",
            numNodes: 2,
            tags: ["production"],
        };
        const database: DatabaseCluster = await createDatabase(dbCreateReq);
        const dbId = database.id;
        try {
            await waitForDatabaseActive(dbId);
            const updateReq = {
                version: "17",
            };
            const updateResp = await client.v2.databases.byDatabase_cluster_uuid(dbId).upgrade.put(updateReq);
            expect(updateResp).toBeUndefined();

        } finally {
            await deleteDatabase(dbId);
        }
    }, 600000);

    it("should create replica and promote as primary", async () => {
        const dbCreateReq: DatabasesPostRequestBody = {
            name: `${PREFIX}-${uuidv4()}`,
            engine: "pg",
            version: "14",
            region: REGION,
            size: "db-s-2vcpu-4gb",
            numNodes: 2,
            tags: ["production"],
        };
        const database: DatabaseCluster = await createDatabase(dbCreateReq);
        const dbId = database.id;

        try {
            await waitForDatabaseActive(dbId);
            const replicaName = "read-dots-nyc3-01";
            const createReplicaReq: Database_replica = {
                name: replicaName,
                region: REGION,
                size: "db-s-2vcpu-4gb",
            };
            const createRepResponse = await client.v2.databases.byDatabase_cluster_uuid(dbId).replicas.post(createReplicaReq);
            expect(createRepResponse).toBeDefined();
            await waitForReplicaActive(dbId, replicaName);
            const promoteReplica = await client.v2.databases.byDatabase_cluster_uuid(dbId).replicas.byReplica_name(replicaName).promote.put();
            expect(promoteReplica).toBeUndefined();

        } finally {
            await deleteDatabase(dbId);
        }
    }, 1000000);

    async function createDatabase(req: DatabasesPostRequestBody): Promise<DatabaseCluster> {
        console.log(`Creating database cluster using: ${JSON.stringify(req)}`);
        try {
            const resp = await client.v2.databases.post(req);
            if (resp && resp.database) {
                const database = resp.database;
                console.log(`Created database cluster ${database.name} <ID: ${database.id}>`);
                return {
                    id: database.id as string,
                    name: database.name as string,
                    engine: database.engine as string,
                    version: database.version as string,
                    region: database.region as string,
                    size: database.size as string,
                    numNodes: database.numNodes as number,
                    status: database.status as string,
                };
            } else {
                throw new Error("Failed to create database cluster or database is undefined");
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
    async function waitForDatabaseActive(dbId: string, maxWaitTime = 600000): Promise<void> {
        const startTime = Date.now();
        const pollInterval = 30000; // 30 seconds

        console.log(`Waiting for database ${dbId} to become active...`);

        while (Date.now() - startTime < maxWaitTime) {
            try {
                const resp = await client.v2.databases.byDatabase_cluster_uuid(dbId).get();
                if (resp && resp.database && resp.database.status === "online") {
                    console.log(`Database ${dbId} is now active`);
                    return;
                }
                console.log(`Database ${dbId} status: ${resp?.database?.status}, waiting...`);
            } catch (err) {
                console.error(`Error checking database status: ${err}`);
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Database ${dbId} did not become active within ${maxWaitTime}ms`);
    }
    async function waitForReplicaActive(dbId: string, replicaName: string, maxWaitTime = 600000): Promise<void> {
        const startTime = Date.now();
        const pollInterval = 30000; // 30 seconds

        console.log(`Waiting for replica ${replicaName} to become active...`);

        while (Date.now() - startTime < maxWaitTime) {
            try {
                const resp = await client.v2.databases.byDatabase_cluster_uuid(dbId).replicas.byReplica_name(replicaName).get();
                if (resp && resp.replica && resp.replica.status === "online") {
                    console.log(`Replica ${replicaName} is now active`);
                    return;
                }
                console.log(`Replica ${replicaName} status: ${resp?.replica?.status}, waiting...`);
            } catch (err) {
                console.error(`Error checking replica status: ${err}`);
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Replica ${replicaName} did not become active within ${maxWaitTime}ms`);
    }
    async function deleteDatabase(dbId: string): Promise<void> {
        console.log(`Deleting database cluster <ID: ${dbId}>`);
        try {
            await client.v2.databases.byDatabase_cluster_uuid(dbId).delete();
            console.log(`Deleted database cluster <ID: ${dbId}>`);
        } catch (err) {
            console.error(`Failed to delete database cluster <ID: ${dbId}>:`, err);
        }
    }
});