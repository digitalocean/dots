// databases.test.ts
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Databases API", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should add database", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const addReq = { name: "alpha" };
        const addReqNock = { name: "alpha" };
        const expected = { db: { name: "alpha" } };
        const typeExpected = { db: { name: "alpha" } };
        nock(baseUrl).post(`/v2/databases/${clusterUuid}/dbs`, addReqNock).reply(201, expected);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).dbs.post(addReq);
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should add connection pool", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const addPoolReq = {
            name: "backend-pool",
            mode: "transaction",
            size: 10,
            db: "defaultdb",
            user: "doadmin",
        };
        const addPoolReqNock = {
            name: "backend-pool",
            mode: "transaction",
            size: 10,
            db: "defaultdb",
            user: "doadmin",
        };
        const expected = {
            pool: {
                user: "doadmin",
                name: "backend-pool",
                size: 10,
                db: "defaultdb",
                mode: "transaction",
                connection: {
                    uri: "postgres://doadmin:wv78n3zpz42xezdk@backend-do-user-19081923-0.db.ondigitalocean.com:25061/backend-pool?sslmode=require",
                    database: "backend-pool",
                    host: "backend-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25061,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
            }
        };
        nock(baseUrl).post(`/v2/databases/${clusterUuid}/pools`, addPoolReqNock).reply(201, expected);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).pools.post(addPoolReq);
        expect(resp).toStrictEqual(expected);
    });
    it("should update connection pool", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const poolName = "test";
        const updateReq = {
            mode: "transaction",
            size: 10,
            db: "defaultdb",
            user: "doadmin"
        };
        const updateReqNock = {
            mode: "transaction",
            size: 10,
            db: "defaultdb",
            user: "doadmin"
        };
        nock(baseUrl).put(`/v2/databases/${clusterUuid}/pools/${poolName}`, updateReqNock).reply(204);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).pools.byPool_name(poolName).put(updateReq);
        expect(resp).toBeUndefined();
    });
    it("should create cluster", async () => {
        const createReq = {
            name: "backend-cluster",
            engine: "pg",
            version: "14",
            region: "nyc3",
            size: "db-s-2vcpu-4gb",
            numNodes: 3,
            tags: ["production"],
        };
        const createReqNock = {
            name: "backend-cluster",
            engine: "pg",
            version: "14",
            region: "nyc3",
            size: "db-s-2vcpu-4gb",
            num_nodes: 3,
            tags: ["production"],
        };
        const expected = {
            database: {
                id: "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30",
                name: "backend-cluster",
                engine: "pg",
                version: "14",
                semantic_version: "14.5",
                connection: {
                    uri: "postgres://doadmin:wv78n3zpz42xezdk@backend-do-user-19081923-0.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
                    database: "",
                    host: "backend-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25060,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
                private_connection: {
                    uri: "postgres://doadmin:wv78n3zpz42xezdk@private-backend-do-user-19081923-0.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
                    database: "",
                    host: "private-backend-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25060,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
                users: [
                    { name: "doadmin", role: "primary", password: "wv78n3zpz42xezdk" }
                ],
                db_names: ["defaultdb"],
                num_nodes: 3,
                region: "nyc3",
                status: "creating",
                created_at: "2019-01-11T18:37:36Z",
                maintenance_window: {
                    day: "saturday",
                    hour: "08:45:12",
                    pending: true,
                    description: [
                        "Update TimescaleDB to version 1.2.1",
                        "Upgrade to PostgreSQL 11.2 and 10.7 bugfix releases",
                    ],
                },
                size: "db-s-2vcpu-4gb",
                tags: ["production"],
                private_network_uuid: "d455e75d-4858-4eec-8c95-da2f0a5f93a7",
                version_end_of_life: "2023-11-09T00:00:00Z",
                version_end_of_availability: "2023-05-09T00:00:00Z",
            }
        };
        const typeExpected = {
            database: {
                id: "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30",
                name: "backend-cluster",
                engine: "pg",
                version: "14",
                semanticVersion: "14.5",
                connection: {
                    uri: "postgres://doadmin:wv78n3zpz42xezdk@backend-do-user-19081923-0.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
                    database: "",
                    host: "backend-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25060,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
                privateConnection: {
                    uri: "postgres://doadmin:wv78n3zpz42xezdk@private-backend-do-user-19081923-0.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
                    database: "",
                    host: "private-backend-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25060,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
                users: [
                    { name: "doadmin", role: "primary", password: "wv78n3zpz42xezdk" }
                ],
                dbNames: ["defaultdb"],
                numNodes: 3,
                region: "nyc3",
                status: "creating",
                createdAt: new Date("2019-01-11T18:37:36Z"),
                maintenanceWindow: {
                    day: "saturday",
                    hour: "08:45:12",
                    pending: true,
                    description: [
                        "Update TimescaleDB to version 1.2.1",
                        "Upgrade to PostgreSQL 11.2 and 10.7 bugfix releases",
                    ],
                },
                size: "db-s-2vcpu-4gb",
                tags: ["production"],
                privateNetworkUuid: "d455e75d-4858-4eec-8c95-da2f0a5f93a7",
                versionEndOfLife: "2023-11-09T00:00:00Z",
                versionEndOfAvailability: "2023-05-09T00:00:00Z",
            }
        };
        nock(baseUrl).post("/v2/databases", createReqNock).reply(201, expected);
        const resp = await client.v2.databases.post(createReq);
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should add user", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const addUserReq = { name: "app-01" };
        const addUserReqNock = { name: "app-01" };
        const expected = {
            user: { name: "app-01", role: "normal", password: "jge5lfxtzhx42iff" }
        };
        const typeExpected = {
            user: { name: "app-01", role: "normal", password: "jge5lfxtzhx42iff" }
        };
        nock(baseUrl).post(`/v2/databases/${clusterUuid}/users`, addUserReqNock).reply(201, expected);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).users.post(addUserReq);
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should update major version", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const updateReq = { version: "14" };
        const updateReqNock = { version: "14" };
        nock(baseUrl).put(`/v2/databases/${clusterUuid}/upgrade`, updateReqNock).reply(204);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).upgrade.put(updateReq);
        expect(resp).toBeUndefined();
    });
    it("should create replica", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const createReplicaReq = {
            name: "read-nyc3-01",
            region: "nyc3",
            size: "db-s-2vcpu-4gb"
        };
        const createReplicaReqNock = {
            name: "read-nyc3-01",
            region: "nyc3",
            size: "db-s-2vcpu-4gb"
        };
        const expected = {
            replica: {
                name: "read-nyc3-01",
                connection: {
                    uri: "",
                    database: "defaultdb",
                    host: "read-nyc3-01-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25060,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
                private_connection: {
                    uri: "postgres://doadmin:wv78n3zpz42xezdk@private-read-nyc3-01-do-user-19081923-0.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
                    database: "",
                    host: "private-read-nyc3-01-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25060,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
                region: "nyc3",
                status: "online",
                created_at: "2019-01-11T18:37:36Z",
            }
        };
        const typeExpected = {
            replica: {
                name: "read-nyc3-01",
                connection: {
                    uri: "",
                    database: "defaultdb",
                    host: "read-nyc3-01-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25060,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
                privateConnection: {
                    uri: "postgres://doadmin:wv78n3zpz42xezdk@private-read-nyc3-01-do-user-19081923-0.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
                    database: "",
                    host: "private-read-nyc3-01-do-user-19081923-0.db.ondigitalocean.com",
                    port: 25060,
                    user: "doadmin",
                    password: "wv78n3zpz42xezdk",
                    ssl: true,
                },
                region: "nyc3",
                status: "online",
                createdAt: new Date("2019-01-11T18:37:36Z"),
            }
        };
        nock(baseUrl).post(`/v2/databases/${clusterUuid}/replicas`, createReplicaReqNock).reply(201, expected);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).replicas.post(createReplicaReq);
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should promote replica", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const replicaName = "postgres_nyc_replica";
        nock(baseUrl).put(`/v2/databases/${clusterUuid}/replicas/${replicaName}/promote`).reply(204);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).replicas.byReplica_name(replicaName).promote.put();
        expect(resp).toBeUndefined();
    });
    it("should get user", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const userName = "app-01";
        const expected = {
            user: { name: "app-01", role: "normal", password: "jge5lfxtzhx42iff" }
        };
        const typeExpected = {
            user: { name: "app-01", role: "normal", password: "jge5lfxtzhx42iff" }
        };
        nock(baseUrl).get(`/v2/databases/${clusterUuid}/users/${userName}`).reply(200, expected);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).users.byUsername(userName).get();
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should list databases", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const expected = { dbs: [{ name: "alpha" }, { name: "defaultdb" }] };
        const typeExpected = { dbs: [{ name: "alpha" }, { name: "defaultdb" }] };
        nock(baseUrl).get(`/v2/databases/${clusterUuid}/dbs`).reply(200, expected);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).dbs.get();
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should list backups", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const expected = {
            backups: [
                { created_at: "2019-01-11T18:42:27Z", size_gigabytes: 0.03357696 },
                { created_at: "2019-01-12T18:42:29Z", size_gigabytes: 0.03364864 },
            ]
        };
        const typeExpected = {
            backups: [
                { createdAt: new Date("2019-01-11T18:42:27Z"), sizeGigabytes: 0.03357696 },
                { createdAt: new Date("2019-01-12T18:42:29Z"), sizeGigabytes: 0.03364864 },
            ]
        };
        nock(baseUrl).get(`/v2/databases/${clusterUuid}/backups`).reply(200, expected);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).backups.get();
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should delete database", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const databaseName = "alpha";
        nock(baseUrl).delete(`/v2/databases/${clusterUuid}/dbs/${databaseName}`).reply(204);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).dbs.byDatabase_name(databaseName).delete();
        expect(resp).toBeUndefined();
    });
    it("should delete connection pool", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const poolName = "backend-pool";
        nock(baseUrl).delete(`/v2/databases/${clusterUuid}/pools/${poolName}`).reply(204);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).pools.byPool_name(poolName).delete();
        expect(resp).toBeUndefined();
    });
    it("should delete user", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const userName = "app-01";
        nock(baseUrl).delete(`/v2/databases/${clusterUuid}/users/${userName}`).reply(204);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).users.byUsername(userName).delete();
        expect(resp).toBeUndefined();
    });
    it("should destroy replica", async () => {
        const clusterUuid = "9cc10173-e9ea-4176-9dbc-a4cee4c4ff30";
        const replicaName = "read_nyc_3";
        nock(baseUrl).delete(`/v2/databases/${clusterUuid}/replicas/${replicaName}`).reply(204);
        const resp = await client.v2.databases.byDatabase_cluster_uuid(clusterUuid).replicas.byReplica_name(replicaName).delete();
        expect(resp).toBeUndefined();
    });
    it("should get metrics credentials", async () => {
        const expected = {
            credentials: {
                basic_auth_username: "username",
                basic_auth_password: "password",
            }
        };
        const typeExpected = {
            credentials: {
                additionalData: {
                    basic_auth_username: "username",
                    basic_auth_password: "password",
                }
            }
        };
        nock(baseUrl).get("/v2/databases/metrics/credentials").reply(200, expected);
        const resp = await client.v2.databases.metrics.credentials.get();
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should update metrics credentials", async () => {
        const updateReq = {
            credentials: {
                basicAuthUsername: "new_username",
                basicAuthPassword: "new_password",
            }
        };
        const updateReqNock = {
            credentials: {
                basic_auth_username: "new_username",
                basic_auth_password: "new_password",
            }
        };
        nock(baseUrl).put("/v2/databases/metrics/credentials", updateReqNock).reply(204);
        const resp = await client.v2.databases.metrics.credentials.put(updateReq);
        expect(resp).toBeUndefined();
    });
});
