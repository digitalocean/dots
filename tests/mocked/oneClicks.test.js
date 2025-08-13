import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("One-click API Mock Tests", () => {
    afterEach(() => {
        nock.cleanAll();
    });
    it("should list one-click applications", async () => {
        const expected = {
            "1_clicks": [
                { "slug": "monitoring", "type": "kubernetes" },
                { "slug": "wordpress-18-04", "type": "droplet" },
            ]
        };
        const typeExpected = {
            oneClicks: [
                { slug: "monitoring", type: "kubernetes" },
                { slug: "wordpress-18-04", type: "droplet" },
            ]
        };
        nock(baseUrl).get("/v2/1-clicks").reply(200, expected);
        const oneClickApps = await client.v2.oneClicks.get();
        expect(oneClickApps).toStrictEqual(typeExpected);
    });
    it("should list one-click applications with query", async () => {
        const expected = {
            "1_clicks": [
                { "slug": "wordpress-18-04", "type": "droplet" },
            ]
        };
        const typeExpected = {
            oneClicks: [
                { slug: "wordpress-18-04", type: "droplet" },
            ]
        };
        nock(baseUrl)
            .get("/v2/1-clicks")
            .query({ type: "droplet" })
            .reply(200, expected);
        const oneClickApps = await client.v2.oneClicks.get({
            queryParameters: {
                type: "droplet"
            }
        });
        expect(oneClickApps).toStrictEqual(typeExpected);
    });
    it("should install kubernetes one-click application", async () => {
        const installReqNock = {
            addon_slugs: ["monitoring", "kube-state-metrics"],
            cluster_uuid: "bd5f5959-5e1e-4205-a714-a914373942af"
        };
        const installReq = {
            addonSlugs: ["monitoring", "kube-state-metrics"],
            clusterUuid: "bd5f5959-5e1e-4205-a714-a914373942af"
        };
        const expected = {
            message: "Successfully kicked off addon job."
        };
        const typeExpected = {
            message: "Successfully kicked off addon job."
        };
        nock(baseUrl)
            .post("/v2/1-clicks/kubernetes", installReqNock)
            .reply(200, expected);
        const installResp = await client.v2.oneClicks.kubernetes.post(installReq);
        expect(installResp).toStrictEqual(typeExpected);
    });
    it("should install kubernetes one-click application with proper request body", async () => {
        const installReqNock = {
            addon_slugs: ["monitoring", "kube-state-metrics"],
            cluster_uuid: "bd5f5959-5e1e-4205-a714-a914373942af"
        };
        const installReq = {
            addonSlugs: ["monitoring", "kube-state-metrics"],
            clusterUuid: "bd5f5959-5e1e-4205-a714-a914373942af"
        };
        const expected = {
            message: "Successfully kicked off addon job."
        };
        const typeExpected = {
            message: "Successfully kicked off addon job."
        };
        nock(baseUrl)
            .post("/v2/1-clicks/kubernetes", installReqNock)
            .reply(200, expected);
        const installResp = await client.v2.oneClicks.kubernetes.post(installReq);
        expect(installResp).toStrictEqual(typeExpected);
    });
    it("should handle one-click list with different types", async () => {
        const kubernetesExpected = {
            "1_clicks": [
                { "slug": "monitoring", "type": "kubernetes" },
                { "slug": "prometheus", "type": "kubernetes" },
            ]
        };
        const kubernetesTypeExpected = {
            oneClicks: [
                { slug: "monitoring", type: "kubernetes" },
                { slug: "prometheus", type: "kubernetes" },
            ]
        };
        nock(baseUrl)
            .get("/v2/1-clicks")
            .query({ type: "kubernetes" })
            .reply(200, kubernetesExpected);
        const kubernetesApps = await client.v2.oneClicks.get({
            queryParameters: {
                type: "kubernetes"
            }
        });
        expect(kubernetesApps).toStrictEqual(kubernetesTypeExpected);
    });
    it("should handle empty one-click list", async () => {
        const expected = {
            "1_clicks": []
        };
        const typeExpected = {
            oneClicks: []
        };
        nock(baseUrl)
            .get("/v2/1-clicks")
            .reply(200, expected);
        const oneClickApps = await client.v2.oneClicks.get();
        expect(oneClickApps).toStrictEqual(typeExpected);
    });
    it("should handle one-click install with minimal request", async () => {
        const minimalReq = {
            addonSlugs: ["monitoring"],
            clusterUuid: "test-cluster-uuid"
        };
        const minimalReqNock = {
            addon_slugs: ["monitoring"],
            cluster_uuid: "test-cluster-uuid"
        };
        const expected = {
            message: "Successfully kicked off addon job."
        };
        const typeExpected = {
            message: "Successfully kicked off addon job."
        };
        nock(baseUrl)
            .post("/v2/1-clicks/kubernetes", minimalReqNock)
            .reply(200, expected);
        const installResp = await client.v2.oneClicks.kubernetes.post(minimalReq);
        expect(installResp).toStrictEqual(typeExpected);
    });
});
