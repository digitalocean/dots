import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Monitoring API Mock Tests", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should list alert policies", async () => {
        const expected = {
            policies: [
                {
                    alerts: {
                        email: ["bob@example.com"],
                        slack: [
                            {
                                channel: "Production Alerts",
                                url: 'https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ"',
                            }
                        ],
                    },
                    compare: "GreaterThan",
                    description: "CPU Alert",
                    enabled: true,
                    entities: [192018292],
                    tags: ["production_droplets"],
                    type: "v1/insights/droplet/cpu",
                    uuid: "78b3da62-27e5-49ba-ac70-5db0b5935c64",
                    value: 80,
                    window: "5m",
                }
            ],
            links: {
                first: "https//api.digitalocean.com/v2/monitoring/alerts?page=1&per_page=10",
                prev: "https//api.digitalocean.com/v2/monitoring/alerts?page=2&per_page=10",
                next: "https//api.digitalocean.com/v2/monitoring/alerts?page=4&per_page=10",
                last: "https//api.digitalocean.com/v2/monitoring/alerts?page=5&per_page=10",
            },
            meta: { total: 50 },
        };
        const typeExpected = {
            policies: [
                {
                    alerts: {
                        email: ["bob@example.com"],
                        slack: [
                            {
                                channel: "Production Alerts",
                                url: 'https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ"',
                            }
                        ],
                    },
                    compare: "GreaterThan",
                    description: "CPU Alert",
                    enabled: true,
                    entities: [192018292],
                    tags: ["production_droplets"],
                    type: "v1/insights/droplet/cpu",
                    uuid: "78b3da62-27e5-49ba-ac70-5db0b5935c64",
                    value: 80,
                    window: "5m",
                }
            ],
            links: {
                additionalData: {
                    first: "https//api.digitalocean.com/v2/monitoring/alerts?page=1&per_page=10",
                    prev: "https//api.digitalocean.com/v2/monitoring/alerts?page=2&per_page=10",
                    next: "https//api.digitalocean.com/v2/monitoring/alerts?page=4&per_page=10",
                    last: "https//api.digitalocean.com/v2/monitoring/alerts?page=5&per_page=10",
                }
            },
            meta: { total: 50 },
        };
        nock(baseUrl).get("/v2/monitoring/alerts").reply(200, expected);
        const resp = await client.v2.monitoring.alerts.get();
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should create alert policy", async () => {
        const createReq = {
            alerts: {
                email: ["bob@example.com"],
                slack: [
                    {
                        channel: "Production Alerts",
                        url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                    }
                ],
            },
            compare: "GreaterThan",
            description: "CPU Alert",
            enabled: true,
            entities: ["192018292"],
            tags: ["droplet_tag"],
            type: "v1/insights/droplet/cpu",
            value: 80,
            window: "5m",
        };
        const createReqNock = {
            alerts: {
                email: ["bob@example.com"],
                slack: [
                    {
                        channel: "Production Alerts",
                        url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                    }
                ],
            },
            compare: "GreaterThan",
            description: "CPU Alert",
            enabled: true,
            entities: ["192018292"],
            tags: ["droplet_tag"],
            type: "v1/insights/droplet/cpu",
            value: 80,
            window: "5m",
        };
        const expected = {
            policy: {
                alerts: {
                    email: ["bob@example.com"],
                    slack: [
                        {
                            channel: "Production Alerts",
                            url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                        }
                    ],
                },
                compare: "GreaterThan",
                description: "CPU Alert",
                enabled: true,
                entities: ["192018292"],
                tags: ["droplet_tag"],
                type: "v1/insights/droplet/cpu",
                uuid: "78b3da62-27e5-49ba-ac70-5db0b5935c64",
                value: 80,
                window: "5m",
            }
        };
        const typeExpected = {
            policy: {
                alerts: {
                    email: ["bob@example.com"],
                    slack: [
                        {
                            channel: "Production Alerts",
                            url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                        }
                    ],
                },
                compare: "GreaterThan",
                description: "CPU Alert",
                enabled: true,
                entities: ["192018292"],
                tags: ["droplet_tag"],
                type: "v1/insights/droplet/cpu",
                uuid: "78b3da62-27e5-49ba-ac70-5db0b5935c64",
                value: 80,
                window: "5m",
            }
        };
        nock(baseUrl).post("/v2/monitoring/alerts", createReqNock).reply(200, expected);
        const resp = await client.v2.monitoring.alerts.post(createReq);
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should get alert policy", async () => {
        const alertUuid = "78b3da62-27e5-49ba-ac70-5db0b5935c64";
        const expected = {
            policy: {
                alerts: {
                    email: ["bob@example.com"],
                    slack: [
                        {
                            channel: "Production Alerts",
                            url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                        }
                    ],
                },
                compare: "GreaterThan",
                description: "CPU Alert",
                enabled: true,
                entities: ["192018292"],
                tags: ["droplet_tag"],
                type: "v1/insights/droplet/cpu",
                uuid: "78b3da62-27e5-49ba-ac70-5db0b5935c64",
                value: 80,
                window: "5m",
            }
        };
        const typeExpected = {
            policy: {
                alerts: {
                    email: ["bob@example.com"],
                    slack: [
                        {
                            channel: "Production Alerts",
                            url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                        }
                    ],
                },
                compare: "GreaterThan",
                description: "CPU Alert",
                enabled: true,
                entities: ["192018292"],
                tags: ["droplet_tag"],
                type: "v1/insights/droplet/cpu",
                uuid: "78b3da62-27e5-49ba-ac70-5db0b5935c64",
                value: 80,
                window: "5m",
            }
        };
        nock(baseUrl).get(`/v2/monitoring/alerts/${alertUuid}`).reply(200, expected);
        const resp = await client.v2.monitoring.alerts.byAlert_uuid(alertUuid).get();
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should update alert policy", async () => {
        const alertUuid = "78b3da62-27e5-49ba-ac70-5db0b5935c64";
        const updateReqNock = {
            alerts: {
                email: ["carl@example.com"],
                slack: [
                    {
                        channel: "Production Alerts",
                        url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                    }
                ],
            },
            compare: "GreaterThan",
            description: "CPU Alert",
            enabled: true,
            entities: ["192018292"],
            tags: ["droplet_tag"],
            type: "v1/insights/droplet/cpu",
            value: 80,
            window: "5m",
        };
        const updateReq = {
            alerts: {
                email: ["carl@example.com"],
                slack: [
                    {
                        channel: "Production Alerts",
                        url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                    }
                ],
            },
            compare: "GreaterThan",
            description: "CPU Alert",
            enabled: true,
            entities: ["192018292"],
            tags: ["droplet_tag"],
            type: "v1/insights/droplet/cpu",
            value: 80,
            window: "5m",
        };
        const expected = {
            policy: {
                alerts: {
                    email: ["carl@example.com"],
                    slack: [
                        {
                            channel: "Production Alerts",
                            url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                        }
                    ],
                },
                compare: "GreaterThan",
                description: "CPU Alert",
                enabled: true,
                entities: ["192018292"],
                tags: ["droplet_tag"],
                type: "v1/insights/droplet/cpu",
                uuid: "78b3da62-27e5-49ba-ac70-5db0b5935c64",
                value: 80,
                window: "5m",
            }
        };
        const typeExpected = {
            policy: {
                alerts: {
                    email: ["carl@example.com"],
                    slack: [
                        {
                            channel: "Production Alerts",
                            url: "https://hooks.slack.com/services/T1234567/AAAAAAAA/ZZZZZZ",
                        }
                    ],
                },
                compare: "GreaterThan",
                description: "CPU Alert",
                enabled: true,
                entities: ["192018292"],
                tags: ["droplet_tag"],
                type: "v1/insights/droplet/cpu",
                uuid: "78b3da62-27e5-49ba-ac70-5db0b5935c64",
                value: 80,
                window: "5m",
            }
        };
        nock(baseUrl).put(`/v2/monitoring/alerts/${alertUuid}`, updateReqNock).reply(200, expected);
        const resp = await client.v2.monitoring.alerts.byAlert_uuid(alertUuid).put(updateReq);
        expect(resp).toStrictEqual(typeExpected);
    });
    it("should delete alert policy", async () => {
        const alertUuid = "4e1bfbc3-dc3e-41f2-a18f-1b4d7ba71679";
        nock(baseUrl).delete(`/v2/monitoring/alerts/${alertUuid}`).reply(204);
        const resp = await client.v2.monitoring.alerts.byAlert_uuid(alertUuid).delete();
        expect(resp).toBeUndefined();
    });
});
