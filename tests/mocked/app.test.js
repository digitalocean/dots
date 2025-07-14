/*
app.test.ts
*/
import {nock} from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe('Apps API Resource - Create App', () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should mock creating an app", async () => {
        const expected = {
            app: {
                id: "c2a93513-8d9b-4223-9d61-5e7272c81cf5",
                owner_uuid: "a4e16f25-cdd1-4483-b246-d77f283c9209",
                spec: {},
                default_ingress: "https://sample-golang-zyhgn.ondigitalocean.app",
                created_at: "2021-02-10T16:45:14Z",
                updated_at: "2021-02-10T17:06:56Z",
                active_deployment: {},
                last_deployment_created_at: "2021-02-10T17:05:30Z",
                live_url: "https://sample-golang-zyhgn.ondigitalocean.app",
                region: {},
                tier_slug: "basic",
                live_url_base: "https://sample-golang-zyhgn.ondigitalocean.app",
                live_domain: "sample-golang-zyhgn.ondigitalocean.app",
            },
        };
        const typeExpected = {
            app: {
                id: "c2a93513-8d9b-4223-9d61-5e7272c81cf5",
                ownerUuid: "a4e16f25-cdd1-4483-b246-d77f283c9209",
                spec: {},
                defaultIngress: "https://sample-golang-zyhgn.ondigitalocean.app",
                createdAt: new Date("2021-02-10T16:45:14Z"),
                updatedAt: new Date("2021-02-10T17:06:56Z"),
                activeDeployment: {},
                lastDeploymentCreatedAt: new Date("2021-02-10T17:05:30Z"),
                liveUrl: "https://sample-golang-zyhgn.ondigitalocean.app",
                region: {},
                tierSlug: "basic",
                liveUrlBase: "https://sample-golang-zyhgn.ondigitalocean.app",
                liveDomain: "sample-golang-zyhgn.ondigitalocean.app",
            },
        };
        const requestBody = {
            spec: {
                name: "web-app",
                region: "nyc",
                services: [
                    {
                        name: "api",
                        github: {},
                        runCommand: "bin/api",
                        environmentSlug: "node-js",
                        instanceCount: 2,
                        instanceSizeSlug: "basic-xxs",
                        routes: [],
                    },
                ],
            },
        };
        // Mock the POST request
        const requestBodyNock = {
            spec: {
                name: "web-app",
                region: "nyc",
                services: [
                    {
                        name: "api",
                        github: {},
                        run_command: "bin/api",
                        environment_slug: "node-js",
                        instance_count: 2,
                        instance_size_slug: "basic-xxs",
                        routes: [],
                    },
                ],
            },
        };
        nock(baseUrl).post("/v2/apps", requestBodyNock).reply(200, expected);
        // Call the create method
        const createResp = await client.v2.apps.post(requestBody);
        // Assert the response
        expect(createResp).toEqual(typeExpected);
    });
    it("should mock the list of apps", async () => {
        const expected = {
            apps: [
                {
                    id: "4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf",
                    owner_uuid: "ff36cbc6fd350fe12577f5123133bb5ba01a2419",
                    spec: {},
                    default_ingress: "https://sample-php-iaj87.ondigitalocean.app",
                    created_at: "2020-11-19T20:27:18Z",
                    updated_at: "2020-12-01T00:42:16Z",
                    active_deployment: {},
                    // cause: "app spec updated",
                    // progress: {},
                    last_deployment_created_at: "2020-12-01T00:40:05Z",
                    live_url: "https://sample-php-iaj87.ondigitalocean.app",
                    region: {},
                    tier_slug: "basic",
                    live_url_base: "https://sample-php-iaj87.ondigitalocean.app",
                    live_domain: "sample-php-iaj87.ondigitalocean.app",
                },
            ],
            links: { pages: {} },
            meta: { total: 1 },
        };
        const typeExpected = {
            apps: [
                {
                    id: "4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf",
                    ownerUuid: "ff36cbc6fd350fe12577f5123133bb5ba01a2419",
                    spec: {},
                    defaultIngress: "https://sample-php-iaj87.ondigitalocean.app",
                    createdAt: new Date("2020-11-19T20:27:18Z"),
                    updatedAt: new Date("2020-12-01T00:42:16Z"),
                    activeDeployment: {},
                    // cause: "app spec updated",
                    // progress: {},
                    lastDeploymentCreatedAt: new Date("2020-12-01T00:40:05Z"),
                    liveUrl: "https://sample-php-iaj87.ondigitalocean.app",
                    region: {},
                    tierSlug: "basic",
                    liveUrlBase: "https://sample-php-iaj87.ondigitalocean.app",
                    liveDomain: "sample-php-iaj87.ondigitalocean.app",
                },
            ],
            links: { pages: {} },
            meta: { total: 1 },
        };
        nock(baseUrl).get("/v2/apps").reply(200, expected);
        const listResp = await client.v2.apps.get();
        expect(listResp).toEqual(typeExpected);
    });
    it('should mock updating an app', async () => {
        const appId = '4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf';
        const expected = {
            app: {
                id: "c2a93513-8d9b-4223-9d61-5e7272c81cf5",
                owner_uuid: "a4e16f25-cdd1-4483-b246-d77f283c9209",
                spec: {},
                default_ingress: "https://sample-golang-zyhgn.ondigitalocean.app",
                created_at: "2021-02-10T16:45:14Z",
                updated_at: "2021-02-10T17:06:56Z",
                active_deployment: {},
                last_deployment_created_at: "2021-02-10T17:05:30Z",
                live_url: "https://sample-golang-zyhgn.ondigitalocean.app",
                region: {},
                tier_slug: "basic",
                live_url_base: "https://sample-golang-zyhgn.ondigitalocean.app",
                live_domain: "sample-golang-zyhgn.ondigitalocean.app",
            },
        };
        const typeExpected = {
            app: {
                id: "c2a93513-8d9b-4223-9d61-5e7272c81cf5",
                ownerUuid: "a4e16f25-cdd1-4483-b246-d77f283c9209",
                spec: {},
                defaultIngress: "https://sample-golang-zyhgn.ondigitalocean.app",
                createdAt: new Date("2021-02-10T16:45:14Z"),
                updatedAt: new Date("2021-02-10T17:06:56Z"),
                activeDeployment: {},
                lastDeploymentCreated_at: new Date("2021-02-10T17:05:30Z"),
                liveUrl: "https://sample-golang-zyhgn.ondigitalocean.app",
                region: {},
                tierSlug: "basic",
                liveUrlBase: "https://sample-golang-zyhgn.ondigitalocean.app",
                liveDomain: "sample-golang-zyhgn.ondigitalocean.app",
            },
        };
        const logDestinations = [{
                datadog: {
                    endpoint: "https://mydatadogendpoint.com",
                    apiKey: "abcdefghijklmnopqrstuvwxyz0123456789",
                },
                name: "my_log_destination",
                papertrail: {
                    endpoint: "https://mypapertrailendpoint.com",
                },
                logtail: {
                    token: "abcdefghijklmnopqrstuvwxyz0123456789",
                },
            }];
        const requestBody = {
            spec: {
                name: 'web-app-01',
                region: 'nyc',
                domains: [
                    {
                        domain: 'app.example.com',
                        type: 'DEFAULT',
                        wildcard: true,
                        zone: 'example.com',
                        minimumTlsVersion: '1.3',
                    },
                ],
                services: [],
                staticSites: [
                    {
                        cors: {
                            allowOrigins: [
                                { exact: 'https://www.example.com' },
                                { regex: '^.*example.com' },
                            ],
                            allowMethods: [
                                'GET',
                                'OPTIONS',
                                'POST',
                                'PUT',
                                'PATCH',
                                'DELETE',
                            ],
                            allowHeaders: ['Content-Type', 'X-Custom-Header'],
                            exposeHeaders: ['Content-Encoding', 'X-Custom-Header'],
                            maxAge: '5h30m',
                            allowCredentials: false,
                        },
                        routes: [{ path: '/api', preservePathPrefix: true }],
                    },
                ],
                jobs: [
                    {
                        name: 'api',
                        gitlab: {
                            branch: 'main',
                            deployOnPush: true,
                            repo: 'digitalocean/sample-golang',
                        },
                        image: {
                            registry: 'registry.hub.docker.com',
                            registryType: 'DOCR',
                            repository: 'origin/master',
                            tag: 'latest',
                        },
                        dockerfilePath: 'path/to/Dockerfile',
                        buildCommand: 'npm run build',
                        runCommand: 'bin/api',
                        sourceDir: 'path/to/dir',
                        envs: [
                            {
                                key: 'BASE_URL',
                                scope: 'BUILD_TIME',
                                type: 'GENERAL',
                                value: 'http://example.com',
                            },
                        ],
                        environmentSlug: 'node-js',
                        logDestinations: logDestinations,
                        instanceCount: 2,
                        instanceSizeSlug: 'basic-xxs',
                        kind: 'PRE_DEPLOY',
                    },
                ],
                workers: [
                    {
                        name: 'api',
                        gitlab: {
                            branch: 'main',
                            deployOnPush: true,
                            repo: 'digitalocean/sample-golang',
                        },
                        image: {
                            registry: 'registry.hub.docker.com',
                            registryType: 'DOCR',
                            repository: 'origin/master',
                            tag: 'latest',
                        },
                        dockerfilePath: 'path/to/Dockerfile',
                        buildCommand: 'npm run build',
                        runCommand: 'bin/api',
                        sourceDir: 'path/to/dir',
                        envs: [
                            {
                                key: 'BASE_URL',
                                scope: 'BUILD_TIME',
                                type: 'GENERAL',
                                value: 'http://example.com',
                            },
                        ],
                        environmentSlug: 'node-js',
                        logDestinations: logDestinations,
                        instanceCount: 2,
                        instanceSizeSlug: 'basic-xxs',
                    },
                ],
                functions: [
                    {
                        cors: {
                            allowOrigins: [
                                { exact: 'https://www.example.com' },
                                { regex: '^.*example.com' },
                            ],
                            allowMethods: [
                                'GET',
                                'OPTIONS',
                                'POST',
                                'PUT',
                                'PATCH',
                                'DELETE',
                            ],
                            allowHeaders: ['Content-Type', 'X-Custom-Header'],
                            exposeHeaders: ['Content-Encoding', 'X-Custom-Header'],
                            maxAge: '5h30m',
                            allowCredentials: false,
                        },
                        routes: [{ path: '/api', preservePathPrefix: true }],
                        name: 'api',
                        sourceDir: 'path/to/dir',
                        alerts: [
                            {
                                rule: 'CPU_UTILIZATION',
                                disabled: false,
                                operator: 'GREATER_THAN',
                                value: 2.32,
                                window: 'FIVE_MINUTES',
                            },
                        ],
                        envs: [
                            {
                                key: 'BASE_URL',
                                scope: 'BUILD_TIME',
                                type: 'GENERAL',
                                value: 'http://example.com',
                            },
                        ],
                        gitlab: {
                            branch: 'main',
                            deployOnPush: true,
                            repo: 'digitalocean/sample-golang',
                        },
                        logDestinations: logDestinations,
                    },
                ],
                databases: [
                    {
                        clusterName: 'cluster_name',
                        dbName: 'my_db',
                        dbUser: 'superuser',
                        engine: 'PG',
                        name: 'prod-db',
                        production: true,
                        version: '12',
                    },
                ],
            },
        };
        const requestBodyNock = {
            spec: {
                name: "web-app-01",
                region: "nyc",
                domains: [
                    {
                        domain: "app.example.com",
                        type: "DEFAULT",
                        wildcard: true,
                        zone: "example.com",
                        minimum_tls_version: "1.3",
                    },
                ],
                services: [
                    {
                        name: "api",
                        git: {
                            branch: "main",
                            repo_clone_url: "https://github.com/digitalocean/sample-golang.git",
                        },
                        github: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        gitlab: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        bitbucket: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        image: {
                            registry: "registry.hub.docker.com",
                            registry_type: "DOCR",
                            registry_credentials: "my-dockerhub-username:dckr_pat_the_access_token",
                            repository: "origin/master",
                            tag: "latest",
                            digest: "sha256:795e91610e9cccb7bb80893fbabf9c808df7d52ae1f39cd1158618b4a33041ac",
                            deploy_on_push: {
                                enabled: true,
                            },
                        },
                        dockerfile_path: "path/to/Dockerfile",
                        build_command: "npm run build",
                        run_command: "bin/api",
                        source_dir: "path/to/dir",
                        envs: [
                            {
                                key: "BASE_URL",
                                scope: "BUILD_TIME",
                                type: "GENERAL",
                                value: "http://example.com",
                            },
                        ],
                        environment_slug: "node-js",
                        log_destinations: [
                            {
                                name: "my_log_destination",
                                papertrail: {
                                    endpoint: "https://mypapertrailendpoint.com",
                                },
                                datadog: {
                                    endpoint: "https://mydatadogendpoint.com",
                                    api_key: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                logtail: {
                                    token: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                open_search: {
                                    endpoint: "https://example.com:9300",
                                    basic_auth: {
                                        user: "apps_user",
                                        password: "password1",
                                    },
                                    index_name: "logs",
                                    cluster_name: "my-opensearch-cluster",
                                },
                            },
                        ],
                        instance_count: 2,
                        instance_size_slug: "apps-s-1vcpu-0.5gb",
                        autoscaling: {
                            min_instance_count: 2,
                            max_instance_count: 3,
                            metrics: {
                                cpu: {
                                    percent: 75,
                                },
                            },
                        },
                        cors: {
                            allow_origins: [
                                {
                                    exact: "https://www.example.com",
                                },
                                {
                                    regex: "^.*example.com",
                                },
                            ],
                            allow_methods: ["GET", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
                            allow_headers: ["Content-Type", "X-Custom-Header"],
                            expose_headers: ["Content-Encoding", "X-Custom-Header"],
                            max_age: "5h30m",
                            allow_credentials: false,
                        },
                        health_check: {
                            failure_threshold: 2,
                            port: 80,
                            http_path: "/health",
                            initial_delay_seconds: 30,
                            period_seconds: 60,
                            success_threshold: 3,
                            timeout_seconds: 45,
                        },
                        liveness_health_check: {
                            failure_threshold: 18,
                            port: 80,
                            http_path: "/health",
                            initial_delay_seconds: 30,
                            period_seconds: 10,
                            success_threshold: 1,
                            timeout_seconds: 1,
                        },
                        protocol: "HTTP",
                        http_port: 3000,
                        internal_ports: [80, 443],
                        routes: [
                            {
                                path: "/api",
                                preserve_path_prefix: true,
                            },
                        ],
                        termination: {
                            drain_seconds: 15,
                            grace_period_seconds: 120,
                        },
                    },
                ],
                static_sites: [
                    {
                        name: "api",
                        git: {
                            branch: "main",
                            repo_clone_url: "https://github.com/digitalocean/sample-golang.git",
                        },
                        github: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        gitlab: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        bitbucket: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        image: {
                            registry: "registry.hub.docker.com",
                            registry_type: "DOCR",
                            registry_credentials: "my-dockerhub-username:dckr_pat_the_access_token",
                            repository: "origin/master",
                            tag: "latest",
                            digest: "sha256:795e91610e9cccb7bb80893fbabf9c808df7d52ae1f39cd1158618b4a33041ac",
                            deploy_on_push: {
                                enabled: true,
                            },
                        },
                        dockerfile_path: "path/to/Dockerfile",
                        build_command: "npm run build",
                        run_command: "bin/api",
                        source_dir: "path/to/dir",
                        envs: [
                            {
                                key: "BASE_URL",
                                scope: "BUILD_TIME",
                                type: "GENERAL",
                                value: "http://example.com",
                            },
                        ],
                        environment_slug: "node-js",
                        log_destinations: [
                            {
                                name: "my_log_destination",
                                papertrail: {
                                    endpoint: "https://mypapertrailendpoint.com",
                                },
                                datadog: {
                                    endpoint: "https://mydatadogendpoint.com",
                                    api_key: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                logtail: {
                                    token: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                open_search: {
                                    endpoint: "https://example.com:9300",
                                    basic_auth: {
                                        user: "apps_user",
                                        password: "password1",
                                    },
                                    index_name: "logs",
                                    cluster_name: "my-opensearch-cluster",
                                },
                            },
                        ],
                        index_document: "main.html",
                        error_document: "error.html",
                        catchall_document: "index.html",
                        output_dir: "dist/",
                        cors: {
                            allow_origins: [
                                {
                                    exact: "https://www.example.com",
                                },
                                {
                                    regex: "^.*example.com",
                                },
                            ],
                            allow_methods: ["GET", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
                            allow_headers: ["Content-Type", "X-Custom-Header"],
                            expose_headers: ["Content-Encoding", "X-Custom-Header"],
                            max_age: "5h30m",
                            allow_credentials: false,
                        },
                        routes: [
                            {
                                path: "/api",
                                preserve_path_prefix: true,
                            },
                        ],
                    },
                ],
                jobs: [
                    {
                        name: "api",
                        git: {
                            branch: "main",
                            repo_clone_url: "https://github.com/digitalocean/sample-golang.git",
                        },
                        github: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        gitlab: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        bitbucket: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        image: {
                            registry: "registry.hub.docker.com",
                            registry_type: "DOCR",
                            registry_credentials: "my-dockerhub-username:dckr_pat_the_access_token",
                            repository: "origin/master",
                            tag: "latest",
                            digest: "sha256:795e91610e9cccb7bb80893fbabf9c808df7d52ae1f39cd1158618b4a33041ac",
                            deploy_on_push: {
                                enabled: true,
                            },
                        },
                        dockerfile_path: "path/to/Dockerfile",
                        build_command: "npm run build",
                        run_command: "bin/api",
                        source_dir: "path/to/dir",
                        envs: [
                            {
                                key: "BASE_URL",
                                scope: "BUILD_TIME",
                                type: "GENERAL",
                                value: "http://example.com",
                            },
                        ],
                        environment_slug: "node-js",
                        log_destinations: [
                            {
                                name: "my_log_destination",
                                papertrail: {
                                    endpoint: "https://mypapertrailendpoint.com",
                                },
                                datadog: {
                                    endpoint: "https://mydatadogendpoint.com",
                                    api_key: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                logtail: {
                                    token: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                open_search: {
                                    endpoint: "https://example.com:9300",
                                    basic_auth: {
                                        user: "apps_user",
                                        password: "password1",
                                    },
                                    index_name: "logs",
                                    cluster_name: "my-opensearch-cluster",
                                },
                            },
                        ],
                        instance_count: 2,
                        instance_size_slug: "apps-s-1vcpu-0.5gb",
                        autoscaling: {
                            min_instance_count: 2,
                            max_instance_count: 3,
                            metrics: {
                                cpu: {
                                    percent: 75,
                                },
                            },
                        },
                        kind: "PRE_DEPLOY",
                        termination: {
                            grace_period_seconds: 120,
                        },
                    },
                ],
                workers: [
                    {
                        name: "api",
                        git: {
                            branch: "main",
                            repo_clone_url: "https://github.com/digitalocean/sample-golang.git",
                        },
                        github: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        gitlab: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        bitbucket: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        image: {
                            registry: "registry.hub.docker.com",
                            registry_type: "DOCR",
                            registry_credentials: "my-dockerhub-username:dckr_pat_the_access_token",
                            repository: "origin/master",
                            tag: "latest",
                            digest: "sha256:795e91610e9cccb7bb80893fbabf9c808df7d52ae1f39cd1158618b4a33041ac",
                            deploy_on_push: {
                                enabled: true,
                            },
                        },
                        dockerfile_path: "path/to/Dockerfile",
                        build_command: "npm run build",
                        run_command: "bin/api",
                        source_dir: "path/to/dir",
                        envs: [
                            {
                                key: "BASE_URL",
                                scope: "BUILD_TIME",
                                type: "GENERAL",
                                value: "http://example.com",
                            },
                        ],
                        environment_slug: "node-js",
                        log_destinations: [
                            {
                                name: "my_log_destination",
                                papertrail: {
                                    endpoint: "https://mypapertrailendpoint.com",
                                },
                                datadog: {
                                    endpoint: "https://mydatadogendpoint.com",
                                    api_key: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                logtail: {
                                    token: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                open_search: {
                                    endpoint: "https://example.com:9300",
                                    basic_auth: {
                                        user: "apps_user",
                                        password: "password1",
                                    },
                                    index_name: "logs",
                                    cluster_name: "my-opensearch-cluster",
                                },
                            },
                        ],
                        instance_count: 2,
                        instance_size_slug: "apps-s-1vcpu-0.5gb",
                        autoscaling: {
                            min_instance_count: 2,
                            max_instance_count: 3,
                            metrics: {
                                cpu: {
                                    percent: 75,
                                },
                            },
                        },
                        termination: {
                            grace_period_seconds: 120,
                        },
                        liveness_health_check: {
                            failure_threshold: 18,
                            port: 80,
                            http_path: "/health",
                            initial_delay_seconds: 30,
                            period_seconds: 10,
                            success_threshold: 1,
                            timeout_seconds: 1,
                        },
                    },
                ],
                functions: [
                    {
                        cors: {
                            allow_origins: [
                                {
                                    exact: "https://www.example.com",
                                },
                                {
                                    regex: "^.*example.com",
                                },
                            ],
                            allow_methods: ["GET", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
                            allow_headers: ["Content-Type", "X-Custom-Header"],
                            expose_headers: ["Content-Encoding", "X-Custom-Header"],
                            max_age: "5h30m",
                            allow_credentials: false,
                        },
                        routes: [
                            {
                                path: "/api",
                                preserve_path_prefix: true,
                            },
                        ],
                        name: "api",
                        source_dir: "path/to/dir",
                        alerts: [
                            {
                                rule: "CPU_UTILIZATION",
                                disabled: false,
                                operator: "GREATER_THAN",
                                value: 2.32,
                                window: "FIVE_MINUTES",
                            },
                        ],
                        envs: [
                            {
                                key: "BASE_URL",
                                scope: "BUILD_TIME",
                                type: "GENERAL",
                                value: "http://example.com",
                            },
                        ],
                        git: {
                            branch: "main",
                            repo_clone_url: "https://github.com/digitalocean/sample-golang.git",
                        },
                        github: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        gitlab: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        bitbucket: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        log_destinations: [
                            {
                                name: "my_log_destination",
                                papertrail: {
                                    endpoint: "https://mypapertrailendpoint.com",
                                },
                                datadog: {
                                    endpoint: "https://mydatadogendpoint.com",
                                    api_key: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                logtail: {
                                    token: "abcdefghijklmnopqrstuvwxyz0123456789",
                                },
                                open_search: {
                                    endpoint: "https://example.com:9300",
                                    basic_auth: {
                                        user: "apps_user",
                                        password: "password1",
                                    },
                                    index_name: "logs",
                                    cluster_name: "my-opensearch-cluster",
                                },
                            },
                        ],
                    },
                ],
                databases: [
                    {
                        cluster_name: "cluster_name",
                        db_name: "my_db",
                        db_user: "superuser",
                        engine: "PG",
                        name: "prod-db",
                        production: true,
                        version: "12",
                    },
                ],
                ingress: {
                    rules: [
                        {
                            match: {
                                path: {
                                    prefix: "/api",
                                },
                                authority: {
                                    exact: "example.com",
                                },
                            },
                            cors: {
                                allow_origins: [
                                    {
                                        exact: "https://www.example.com",
                                    },
                                    {
                                        regex: "^.*example.com",
                                    },
                                ],
                                allow_methods: ["GET", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
                                allow_headers: ["Content-Type", "X-Custom-Header"],
                                expose_headers: ["Content-Encoding", "X-Custom-Header"],
                                max_age: "5h30m",
                                allow_credentials: false,
                            },
                            component: {
                                name: "web",
                                preserve_path_prefix: "true",
                                rewrite: "/api/v1/",
                            },
                            redirect: {
                                uri: "/about",
                                authority: "example.com",
                                port: 443,
                                scheme: "https",
                                redirect_code: 302,
                            },
                        },
                    ],
                },
                egress: {
                    type: "AUTOASSIGN",
                },
                maintenance: {
                    enabled: true,
                    archive: true,
                    offline_page_url: "https://example.com/offline.html",
                },
            },
            update_all_source_versions: true,
        };
        // Mock the PUT request
        nock(baseUrl)
            .put(`/v2/apps/${appId}`, requestBodyNock)
            .reply(200, expected);
        // Call the update method
        const updateResp = await client.v2.apps.byApp_Id(appId).put(requestBody);
        // Assert the response
        expect(updateResp).toEqual(expected);
    });
    it("should mock deleting an app", async () => {
        const appId = "1";
        const expected = { id: "1" };
        nock(baseUrl).delete(`/v2/apps/${appId}`).reply(200, expected);
        const resp = await client.v2.apps.byApp_Id(appId).delete();
        expect(resp).toEqual(expected);
    });
    it("should mock proposing an app", async () => {
        const expected = {
            app_name_available: true,
            existing_static_apps: "2",
            spec: {
                name: "sample-golang",
                services: [
                    {
                        name: "web",
                        github: {
                            repo: "digitalocean/sample-golang",
                            branch: "branch",
                        },
                        run_command: "bin/sample-golang",
                        environment_slug: "go",
                        instance_size_slug: "basic-xxs",
                        instance_count: 1,
                        http_port: 8080,
                        routes: [{ path: "/" }],
                    },
                ],
                region: "ams",
            },
            app_cost: 5,
        };
        const typeExpected = {
            appNameAvailable: true,
            existingStaticApps: "2",
            spec: {
                name: "sample-golang",
                services: [
                    {
                        name: "web",
                        github: {
                            repo: "digitalocean/sample-golang",
                            branch: "branch",
                        },
                        runCommand: "bin/sample-golang",
                        environmentSlug: "go",
                        instanceSizeSlug: "basic-xxs",
                        instanceCount: 1,
                        httpPort: 8080,
                        routes: [{ path: "/" }],
                    },
                ],
                region: "ams",
            },
            appCost: 5,
        };
        const proposedSpec = {
            spec: {
                name: "web-app",
                region: "nyc",
                services: [
                    {
                        name: "api",
                        github: {
                            branch: "main",
                            deployOnPush: true,
                            repo: "digitalocean/sample-golang",
                        },
                        runCommand: "bin/api",
                        environmentSlug: "node-js",
                        instanceCount: 2,
                        instanceSizeSlug: "basic-xxs",
                        routes: [{ path: "/api" }],
                    },
                ],
            },
            appId: "b6bdf840-2854-4f87-a36c-5f231c617c84",
        };
        const proposedSpecNock = {
            spec: {
                name: "web-app",
                region: "nyc",
                services: [
                    {
                        name: "api",
                        github: {
                            branch: "main",
                            deploy_on_push: true,
                            repo: "digitalocean/sample-golang",
                        },
                        run_command: "bin/api",
                        environment_slug: "node-js",
                        instance_count: 2,
                        instance_size_slug: "basic-xxs",
                        routes: [{ path: "/api" }],
                    },
                ],
            },
            app_id: "b6bdf840-2854-4f87-a36c-5f231c617c84",
        };
        // Mock the POST request
        nock(baseUrl).post("/v2/apps/propose", proposedSpecNock).reply(200, expected);
        // Call the validate_app_spec method
        const proposeResp = await client.v2.apps.propose.post(proposedSpec);
        // Assert the response
        expect(proposeResp).toEqual(typeExpected);
    });
    it("should mock listing alerts for an app", async () => {
        const appId = "1";
        const expected = {
            alerts: [
                {
                    id: "e552e1f9-c1b0-4e6d-8777-ad6f27767306",
                    spec: { rule: "DEPLOYMENT_FAILED" },
                    emails: ["sammy@digitalocean.com"],
                    phase: "ACTIVE",
                    progress: {
                        steps: [
                            {
                                name: "alert-configure-insight-alert",
                                status: "SUCCESS",
                                started_at: "2020-07-28T18:00:00Z",
                                ended_at: "2020-07-28T18:00:00Z",
                            },
                        ],
                    },
                },
                {
                    id: "b58cc9d4-0702-4ffd-ab45-4c2a8d979527",
                    spec: {
                        rule: "CPU_UTILIZATION",
                        operator: "GREATER_THAN",
                        value: 85,
                        window: "FIVE_MINUTES",
                    },
                    emails: ["sammy@digitalocean.com"],
                    phase: "ACTIVE",
                    progress: {
                        steps: [
                            {
                                name: "alert-configure-insight-alert",
                                status: "SUCCESS",
                                started_at: "2020-07-28T18:00:00Z",
                                ended_at: "2020-07-28T18:00:00Z",
                            },
                        ],
                    },
                },
            ],
        };
        const typeExpected = {
            alerts: [
                {
                    id: "e552e1f9-c1b0-4e6d-8777-ad6f27767306",
                    spec: { rule: "DEPLOYMENT_FAILED" },
                    emails: ["sammy@digitalocean.com"],
                    phase: "ACTIVE",
                    progress: {
                        steps: [
                            {
                                name: "alert-configure-insight-alert",
                                status: "SUCCESS",
                                startedAt: new Date("2020-07-28T18:00:00Z"),
                                endedAt: new Date("2020-07-28T18:00:00Z"),
                            },
                        ],
                    },
                },
                {
                    id: "b58cc9d4-0702-4ffd-ab45-4c2a8d979527",
                    spec: {
                        rule: "CPU_UTILIZATION",
                        operator: "GREATER_THAN",
                        value: 85,
                        window: "FIVE_MINUTES",
                    },
                    emails: ["sammy@digitalocean.com"],
                    phase: "ACTIVE",
                    progress: {
                        steps: [
                            {
                                name: "alert-configure-insight-alert",
                                status: "SUCCESS",
                                startedAt: new Date("2020-07-28T18:00:00Z"),
                                endedAt: new Date("2020-07-28T18:00:00Z"),
                            },
                        ],
                    },
                },
            ],
        };
        // Mock the GET request
        nock(baseUrl).get(`/v2/apps/${appId}/alerts`).reply(200, expected);
        // Call the list_alerts method
        const listResp = await client.v2.apps.byApp_Id(appId).alerts.get();
        // Assert the response
        expect(listResp).toEqual(typeExpected);
    });
    it("should mock changing alert destinations", async () => {
        const appId = "1";
        const alertId = "2";
        const expected = {
            alert: {
                id: "e552e1f9-c1b0-4e6d-8777-ad6f27767306",
                spec: { rule: "DEPLOYMENT_FAILED" },
                emails: ["sammy@digitalocean.com"],
                phase: "ACTIVE",
                progress: {
                    steps: [
                        {
                            name: "alert-configure-insight-alert",
                            status: "SUCCESS",
                            started_at: "2020-07-28T18:00:00Z",
                            ended_at: "2020-07-28T18:00:00Z",
                        },
                    ],
                },
            },
        };
        const typeExpected = {
            alert: {
                id: "e552e1f9-c1b0-4e6d-8777-ad6f27767306",
                spec: { rule: "DEPLOYMENT_FAILED" },
                emails: ["sammy@digitalocean.com"],
                phase: "ACTIVE",
                progress: {
                    steps: [
                        {
                            name: "alert-configure-insight-alert",
                            status: "SUCCESS",
                            startedAt: new Date("2020-07-28T18:00:00Z"),
                            endedAt: new Date("2020-07-28T18:00:00Z"),
                        },
                    ],
                },
            },
        };
        const reqNock = {
            emails: ["sammy@digitalocean.com"],
            slack_webhooks: [
                {
                    url: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
                    channel: "Channel Name",
                },
            ],
        };
        const req = {
            emails: ["sammy@digitalocean.com"],
            slackWebhooks: [
                {
                    url: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
                    channel: "Channel Name",
                },
            ],
        };
        nock(baseUrl)
            .post(`/v2/apps/${appId}/alerts/${alertId}/destinations`, reqNock)
            .reply(200, expected);
        const postResp = await client.v2.apps.byApp_Id(appId).alerts.byAlert_id(alertId).destinations.post(req);
        expect(postResp).toEqual(typeExpected);
    });
    it("should mock listing instance sizes", async () => {
        const expected = {
            instance_sizes: [
                {
                    name: "Basic XXS",
                    slug: "basic-xxs",
                    cpu_type: "SHARED",
                    cpus: "1",
                    memory_bytes: "536870912",
                    usd_per_month: "5.00",
                    usd_per_second: "0.000002066799",
                    tier_slug: "basic",
                    tier_upgrade_to: "professional-xs",
                },
                {
                    name: "Basic XS",
                    slug: "basic-xs",
                    cpu_type: "SHARED",
                    cpus: "1",
                    memory_bytes: "1073741824",
                    usd_per_month: "10.00",
                    usd_per_second: "0.000004133598",
                    tier_slug: "basic",
                    tier_upgrade_to: "professional-xs",
                },
            ],
        };
        const typeExpected = {
            instanceSizes: [
                {
                    name: "Basic XXS",
                    slug: "basic-xxs",
                    cpuType: "SHARED",
                    cpus: "1",
                    memoryBytes: "536870912",
                    usdPerMonth: "5.00",
                    usdPerSecond: "0.000002066799",
                    tierSlug: "basic",
                    tierUpgradeTo: "professional-xs",
                },
                {
                    name: "Basic XS",
                    slug: "basic-xs",
                    cpuType: "SHARED",
                    cpus: "1",
                    memoryBytes: "1073741824",
                    usdPerMonth: "10.00",
                    usdPerSecond: "0.000004133598",
                    tierSlug: "basic",
                    tierUpgradeTo: "professional-xs",
                },
            ],
        };
        nock(baseUrl).get("/v2/apps/tiers/instance_sizes").reply(200, expected);
        const listResp = await client.v2.apps.tiers.instance_sizes.get();
        expect(listResp).toEqual(typeExpected);
    });
    it("should mock getting a specific instance size", async () => {
        const instanceSlug = "basic-xxs";
        const expected = {
            instance_size: {
                name: "Basic XXS",
                slug: "basic-xxs",
                cpu_type: "SHARED",
                cpus: "1",
                memory_bytes: "536870912",
                usd_per_month: "5.00",
                usd_per_second: "0.000002066799",
                tier_slug: "basic",
                tier_upgrade_to: "professional-xs",
            },
        };
        const typeExpected = {
            instanceSize: {
                name: "Basic XXS",
                slug: "basic-xxs",
                cpuType: "SHARED",
                cpus: "1",
                memoryBytes: "536870912",
                usdPerMonth: "5.00",
                usdPerSecond: "0.000002066799",
                tierSlug: "basic",
                tierUpgradeTo: "professional-xs",
            },
        };
        nock(baseUrl)
            .get(`/v2/apps/tiers/instance_sizes/${instanceSlug}`)
            .reply(200, expected);
        const getResp = await client.v2.apps.tiers.instance_sizes.bySlug(instanceSlug).get();
        expect(getResp).toEqual(typeExpected);
    });
    it("should mock getting regions", async () => {
        const expected = {
            regions: [
                {
                    slug: "ams",
                    label: "Amsterdam",
                    flag: "netherlands",
                    continent: "Europe",
                    data_centers: ["ams3"],
                },
                {
                    slug: "nyc",
                    label: "New York",
                    flag: "usa",
                    continent: "North America",
                    data_centers: ["nyc1", "nyc3"],
                },
                {
                    slug: "fra",
                    label: "Frankfurt",
                    flag: "germany",
                    continent: "Europe",
                    data_centers: ["fra1"],
                },
                {
                    slug: "sfo",
                    label: "San Francisco",
                    flag: "usa",
                    continent: "North America",
                    data_centers: ["sfo3"],
                },
                {
                    slug: "sgp",
                    label: "Singapore",
                    flag: "singapore",
                    continent: "Asia",
                    data_centers: ["sgp1"],
                },
                {
                    slug: "blr",
                    label: "Bangalore",
                    flag: "india",
                    continent: "Asia",
                    data_centers: ["blr1"],
                },
                {
                    slug: "tor",
                    label: "Toronto",
                    flag: "canada",
                    continent: "North America",
                    data_centers: ["tor1"],
                },
                {
                    slug: "lon",
                    label: "London",
                    flag: "uk",
                    continent: "Europe",
                    data_centers: ["lon1"],
                },
            ],
        };
        const typeExpected = {
            regions: [
                {
                    slug: "ams",
                    label: "Amsterdam",
                    flag: "netherlands",
                    continent: "Europe",
                    dataCenters: ["ams3"],
                },
                {
                    slug: "nyc",
                    label: "New York",
                    flag: "usa",
                    continent: "North America",
                    dataCenters: ["nyc1", "nyc3"],
                },
                {
                    slug: "fra",
                    label: "Frankfurt",
                    flag: "germany",
                    continent: "Europe",
                    dataCenters: ["fra1"],
                },
                {
                    slug: "sfo",
                    label: "San Francisco",
                    flag: "usa",
                    continent: "North America",
                    dataCenters: ["sfo3"],
                },
                {
                    slug: "sgp",
                    label: "Singapore",
                    flag: "singapore",
                    continent: "Asia",
                    dataCenters: ["sgp1"],
                },
                {
                    slug: "blr",
                    label: "Bangalore",
                    flag: "india",
                    continent: "Asia",
                    dataCenters: ["blr1"],
                },
                {
                    slug: "tor",
                    label: "Toronto",
                    flag: "canada",
                    continent: "North America",
                    dataCenters: ["tor1"],
                },
                {
                    slug: "lon",
                    label: "London",
                    flag: "uk",
                    continent: "Europe",
                    dataCenters: ["lon1"],
                },
            ],
        };
        nock(baseUrl).get("/v2/apps/regions").reply(200, expected);
        const resp = await client.v2.apps.regions.get();
        expect(resp).toEqual(typeExpected);
    });
    // it("should mock creating a rollback", async () => {
    //     const appId = "1";
    //     const expected = {
    //         deployment: {
    //             id: "2",
    //             spec: {
    //                 name: "sample-golang",
    //                 services: [
    //                     {
    //                         name: "web",
    //                         github: {
    //                             repo: "digitalocean/sample-golang",
    //                             branch: "branch",
    //                         },
    //                         run_command: "bin/sample-golang",
    //                         environment_slug: "go",
    //                         instance_size_slug: "basic-xxs",
    //                         instance_count: 2,
    //                         routes: [{ path: "/" }],
    //                     },
    //                 ],
    //                 region: "ams",
    //             },
    //             services: [
    //                 {
    //                     name: "web",
    //                     source_commit_hash: "9a4df0b8e161e323bc3cdf1dc71878080fe144fa",
    //                 },
    //             ],
    //             phase_last_updated_at: "0001-01-01T00:00:00Z",
    //             created_at: "2020-07-28T18:00:00Z",
    //             updated_at: "2020-07-28T18:00:00Z",
    //             cause: "commit 9a4df0b pushed to github/digitalocean/sample-golang",
    //             progress: {
    //                 pending_steps: 6,
    //                 total_steps: 6,
    //                 steps: [
    //                     {
    //                         name: "build",
    //                         status: "PENDING",
    //                         steps: [
    //                             { name: "initialize", status: "PENDING" },
    //                             {
    //                                 name: "components",
    //                                 status: "PENDING",
    //                                 steps: [
    //                                     {
    //                                         name: "web",
    //                                         status: "PENDING",
    //                                         component_name: "web",
    //                                         message_base: "Building service",
    //                                     },
    //                                 ],
    //                             },
    //                         ],
    //                     },
    //                     {
    //                         name: "deploy",
    //                         status: "PENDING",
    //                         steps: [
    //                             { name: "initialize", status: "PENDING" },
    //                             {
    //                                 name: "components",
    //                                 status: "PENDING",
    //                                 steps: [
    //                                     {
    //                                         name: "web",
    //                                         status: "PENDING",
    //                                         steps: [
    //                                             {
    //                                                 name: "deploy",
    //                                                 status: "PENDING",
    //                                                 component_name: "web",
    //                                                 message_base: "Deploying service",
    //                                             },
    //                                             {
    //                                                 name: "wait",
    //                                                 status: "PENDING",
    //                                                 component_name: "web",
    //                                                 message_base: "Waiting for service",
    //                                             },
    //                                         ],
    //                                         component_name: "web",
    //                                     },
    //                                 ],
    //                             },
    //                             { name: "finalize", status: "PENDING" },
    //                         ],
    //                     },
    //                 ],
    //             },
    //             phase: "PENDING_BUILD",
    //             tier_slug: "basic",
    //         },
    //     };
    //     const typeExpected = {
    //         deployment: {
    //             id: "2",
    //             spec: {
    //                 name: "sample-golang",
    //                 services: [
    //                     {
    //                         name: "web",
    //                         github: {
    //                             repo: "digitalocean/sample-golang",
    //                             branch: "branch",
    //                         },
    //                         runCommand: "bin/sample-golang",
    //                         environmentSlug: "go",
    //                         instanceSizeSlug: "basic-xxs",
    //                         instanceCount: 2,
    //                         routes: [{ path: "/" }],
    //                     },
    //                 ],
    //                 region: "ams",
    //             },
    //             services: [
    //                 {
    //                     name: "web",
    //                     sourceCommitHash: "9a4df0b8e161e323bc3cdf1dc71878080fe144fa",
    //                 },
    //             ],
    //             phaseLastUpdatedAt: new Date("0001-01-01T00:00:00Z"),
    //             createdAt: new Date("2020-07-28T18:00:00Z"),
    //             updatedAt: new Date("2020-07-28T18:00:00Z"),
    //             cause: "commit 9a4df0b pushed to github/digitalocean/sample-golang",
    //             progress: {
    //                 pendingSteps: 6,
    //                 totalSteps: 6,
    //                 steps: [
    //                     {
    //                         name: "build",
    //                         status: "PENDING",
    //                         steps: [
    //                             { name: "initialize", status: "PENDING" },
    //                             {
    //                                 name: "components",
    //                                 status: "PENDING",
    //                                 steps: [
    //                                     {
    //                                         name: "web",
    //                                         status: "PENDING",
    //                                         componentName: "web",
    //                                         messageBase: "Building service",
    //                                     },
    //                                 ],
    //                             },
    //                         ],
    //                     },
    //                     {
    //                         name: "deploy",
    //                         status: "PENDING",
    //                         steps: [
    //                             { name: "initialize", status: "PENDING" },
    //                             {
    //                                 name: "components",
    //                                 status: "PENDING",
    //                                 steps: [
    //                                     {
    //                                         name: "web",
    //                                         status: "PENDING",
    //                                         steps: [
    //                                             {
    //                                                 name: "deploy",
    //                                                 status: "PENDING",
    //                                                 componentName: "web",
    //                                                 messageBase: "Deploying service",
    //                                             },
    //                                             {
    //                                                 name: "wait",
    //                                                 status: "PENDING",
    //                                                 componentName: "web",
    //                                                 messageBase: "Waiting for service",
    //                                             },
    //                                         ],
    //                                         componentName: "web",
    //                                     },
    //                                 ],
    //                             },
    //                             { name: "finalize", status: "PENDING" },
    //                         ],
    //                     },
    //                 ],
    //             },
    //             phase: "PENDING_BUILD",
    //             tierSlug: "basic",
    //         },
    //     };
    //     const postReqNock = { deployment_id: "2", skip_pin: false };
    //     const postReq : Apps_rollback_app_request = { deploymentId: "2", skipPin: false };
    //     // Mock the POST request
    //     nock(baseUrl)
    //         .post(`/v2/apps/${appId}/rollback`, postReqNock)
    //         .reply(200, expected);
    //     // Call the create_rollback method
    //     const resp = await client.v2.apps.byApp_Id(appId).rollback.post(postReq);
    //     // Assert the response
    //     expect(resp).toEqual(typeExpected);
    // });
    it("should mock validating a rollback", async () => {
        const appId = "1";
        const expected = { valid: true };
        const validateReq = { deploymentId: "2", skipPin: false };
        const validateReqNock = { deployment_id: "2", skip_pin: false };
        nock(baseUrl)
            .post(`/v2/apps/${appId}/rollback/validate`, validateReqNock)
            .reply(200, expected);
        const resp = await client.v2.apps.byApp_Id(appId).rollback.validate.post(validateReq);
        expect(resp).toEqual(expected);
    });
    it("should mock committing a rollback", async () => {
        const appId = "1";
        nock(baseUrl).post(`/v2/apps/${appId}/rollback/commit`).reply(200);
        const commitResp = await client.v2.apps.byApp_Id(appId).rollback.commit.post();
        expect(JSON.stringify(commitResp)).toEqual(JSON.stringify({}));
    });
    // it("should mock reverting a rollback", async () => {
    //     const appId = "1";
    //     const expected = {
    //         deployment: {
    //             id: "b6bdf840-2854-4f87-a36c-5f231c617c84",
    //             spec: {
    //                 name: "sample-golang",
    //                 services: [
    //                     {
    //                         name: "web",
    //                         github: {
    //                             repo: "digitalocean/sample-golang",
    //                             branch: "branch",
    //                         },
    //                         run_command: "bin/sample-golang",
    //                         environment_slug: "go",
    //                         instance_size_slug: "basic-xxs",
    //                         instance_count: 2,
    //                         routes: [{ path: "/" }],
    //                     },
    //                 ],
    //                 region: "ams",
    //             },
    //             services: [
    //                 {
    //                     name: "web",
    //                     source_commit_hash: "9a4df0b8e161e323bc3cdf1dc71878080fe144fa",
    //                 },
    //             ],
    //             phase_last_updated_at: "0001-01-01T00:00:00Z",
    //             created_at: "2020-07-28T18:00:00Z",
    //             updated_at: "2020-07-28T18:00:00Z",
    //             cause: "commit 9a4df0b pushed to github/digitalocean/sample-golang",
    //             progress: {
    //                 pending_steps: 6,
    //                 total_steps: 6,
    //                 steps: [
    //                     {
    //                         name: "build",
    //                         status: "PENDING",
    //                         steps: [
    //                             { name: "initialize", status: "PENDING" },
    //                             {
    //                                 name: "components",
    //                                 status: "PENDING",
    //                                 steps: [
    //                                     {
    //                                         name: "web",
    //                                         status: "PENDING",
    //                                         component_name: "web",
    //                                         message_base: "Building service",
    //                                     },
    //                                 ],
    //                             },
    //                         ],
    //                     },
    //                     {
    //                         name: "deploy",
    //                         status: "PENDING",
    //                         steps: [
    //                             { name: "initialize", status: "PENDING" },
    //                             {
    //                                 name: "components",
    //                                 status: "PENDING",
    //                                 steps: [
    //                                     {
    //                                         name: "web",
    //                                         status: "PENDING",
    //                                         steps: [
    //                                             {
    //                                                 name: "deploy",
    //                                                 status: "PENDING",
    //                                                 component_name: "web",
    //                                                 message_base: "Deploying service",
    //                                             },
    //                                             {
    //                                                 name: "wait",
    //                                                 status: "PENDING",
    //                                                 component_name: "web",
    //                                                 message_base: "Waiting for service",
    //                                             },
    //                                         ],
    //                                         component_name: "web",
    //                                     },
    //                                 ],
    //                             },
    //                             { name: "finalize", status: "PENDING" },
    //                         ],
    //                     },
    //                 ],
    //             },
    //             phase: "PENDING_BUILD",
    //             tier_slug: "basic",
    //         },
    //     };
    //    const typeExpected = {
    //         deployment: {
    //             id: "b6bdf840-2854-4f87-a36c-5f231c617c84",
    //             spec: {
    //                 name: "sample-golang",
    //                 services: [
    //                     {
    //                         name: "web",
    //                         github: {
    //                             repo: "digitalocean/sample-golang",
    //                             branch: "branch",
    //                         },
    //                         runCommand: "bin/sample-golang",
    //                         environmentSlug: "go",
    //                         instanceSizeSlug: "basic-xxs",
    //                         instanceCount: 2,
    //                         routes: [{ path: "/" }],
    //                     },
    //                 ],
    //                 region: "ams",
    //             },
    //             services: [
    //                 {
    //                     name: "web",
    //                     sourceCommitHash: "9a4df0b8e161e323bc3cdf1dc71878080fe144fa",
    //                 },
    //             ],
    //             phaseLastUpdated_at: "0001-01-01T00:00:00Z",
    //             createdAt: "2020-07-28T18:00:00Z",
    //             updatedAt: "2020-07-28T18:00:00Z",
    //             cause: "commit 9a4df0b pushed to github/digitalocean/sample-golang",
    //             progress: {
    //                 pendingSteps: 6,
    //                 totalSteps: 6,
    //                 steps: [
    //                     {
    //                         name: "build",
    //                         status: "PENDING",
    //                         steps: [
    //                             { name: "initialize", status: "PENDING" },
    //                             {
    //                                 name: "components",
    //                                 status: "PENDING",
    //                                 steps: [
    //                                     {
    //                                         name: "web",
    //                                         status: "PENDING",
    //                                         component_name: "web",
    //                                         message_base: "Building service",
    //                                     },
    //                                 ],
    //                             },
    //                         ],
    //                     },
    //                     {
    //                         name: "deploy",
    //                         status: "PENDING",
    //                         steps: [
    //                             { name: "initialize", status: "PENDING" },
    //                             {
    //                                 name: "components",
    //                                 status: "PENDING",
    //                                 steps: [
    //                                     {
    //                                         name: "web",
    //                                         status: "PENDING",
    //                                         steps: [
    //                                             {
    //                                                 name: "deploy",
    //                                                 status: "PENDING",
    //                                                 component_name: "web",
    //                                                 message_base: "Deploying service",
    //                                             },
    //                                             {
    //                                                 name: "wait",
    //                                                 status: "PENDING",
    //                                                 component_name: "web",
    //                                                 message_base: "Waiting for service",
    //                                             },
    //                                         ],
    //                                         component_name: "web",
    //                                     },
    //                                 ],
    //                             },
    //                             { name: "finalize", status: "PENDING" },
    //                         ],
    //                     },
    //                 ],
    //             },
    //             phase: "PENDING_BUILD",
    //             tier_slug: "basic",
    //         },
    //     };
    //     nock(baseUrl).post(`/v2/apps/${appId}/rollback/revert`).reply(200, expected);
    //     const resp = await client.v2.apps.byApp_Id(appId).rollback.revert.post();
    //     expect(resp).toEqual(typeExpected);
    // });
    it("should mock retrieving bandwidth daily metrics for multiple apps", async () => {
        const typeExpected = {
            appBandwidthUsage: [
                {
                    appId: "4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf",
                    bandwidthBytes: "513668",
                },
                {
                    appId: "c2a93513-8d9b-4223-9d61-5f231c617c84",
                    bandwidthBytes: "254847",
                },
            ],
            date: new Date("2023-01-17T00:00:00Z"),
        };
        const req = {
            appIds: [
                "4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf",
                "c2a93513-8d9b-4223-9d61-5f231c617c84",
            ],
            date: new Date("2023-01-17T00:00:00Z"),
        };
        const expected = {
            app_bandwidth_usage: [
                {
                    app_id: '4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf',
                    bandwidth_bytes: '513668',
                },
                {
                    app_id: 'c2a93513-8d9b-4223-9d61-5f231c617c84',
                    bandwidth_bytes: '254847',
                },
            ],
            date: '2023-01-17T00:00:00.000Z',
        };
        const reqNock = {
            app_ids: [
                '4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf',
                'c2a93513-8d9b-4223-9d61-5f231c617c84',
            ],
            date: '2023-01-17T00:00:00.000Z', // Ensure this matches the request
        };
        nock(baseUrl)
            .post('/v2/apps/metrics/bandwidth_daily', reqNock)
            .reply(200, expected);
        const resp = await client.v2.apps.metrics.bandwidth_daily.post(req);
        expect(resp).toEqual(typeExpected);
    });
    it("should mock retrieving bandwidth daily metrics for a single app", async () => {
        const appId = "4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf";
        const expected = {
            app_bandwidth_usage: [
                {
                    app_id: "4f6c71e2-1e90-4762-9fee-6cc4a0a9f2cf",
                    bandwidth_bytes: "513668",
                },
            ],
            date: "2023-01-17T00:00:00Z",
        };
        const typeExpected = {
            appBandwidthUsage: [
                {
                    appId: appId,
                    bandwidthBytes: "513668",
                },
            ],
            date: new Date("2023-01-17T00:00:00Z"),
        };
        nock(baseUrl)
            .get(`/v2/apps/${appId}/metrics/bandwidth_daily`)
            .reply(200, expected);
        const resp = await client.v2.apps.byApp_Id(appId).metrics.bandwidth_daily.get();
        expect(resp).toEqual(typeExpected);
    });
});
