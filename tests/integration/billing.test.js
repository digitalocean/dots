import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import * as fs from "fs";
const invoiceUuid = "mock-invoice-uuid";
const baseUrl = 'https://api.digitalocean.com';
import dotenv from "dotenv";
dotenv.config();
const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN is not set. Please check your .env file.");
}
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
describe("Integration Test for Billing", () => {
    beforeEach(() => {
        nock.cleanAll();
    });
    it("should get customer balance", async () => {
        const expectedResponse = { account_balance: "0.00" };
        nock(baseUrl)
            .get("/v2/customers/my/balance")
            .reply(200, expectedResponse);
        const getResp = await client.v2.customers.my.balance.get();
        expect(getResp).not.toBeNull();
        expect(getResp?.accountBalance).toBe("0.00");
    });
    it("should list billing history", async () => {
        const expectedResponse = {
            billing_history: [
                { type: "Invoice" },
                { type: "Payment" },
            ],
        };
        nock(baseUrl)
            .get("/v2/customers/my/billing_history")
            .reply(200, expectedResponse);
        const getResp = await client.v2.customers.my.billing_history.get();
        expect(getResp).not.toBeNull();
        expect(getResp?.billingHistory).toBeDefined();
        expect(getResp?.billingHistory?.[0]?.type === "Invoice" ||
            getResp?.billingHistory?.[0]?.type === "Payment").toBeTruthy();
    });
    it("should list invoices", async () => {
        const expectedResponse = {
            billing_history: [
                { type: "Invoice" },
                { type: "Payment" },
            ],
        };
        nock(baseUrl)
            .get("/v2/customers/my/billing_history")
            .reply(200, expectedResponse);
        const getResp = await client.v2.customers.my.billing_history.get();
        expect(getResp).not.toBeNull();
        expect(getResp?.billingHistory).toBeDefined();
        expect(getResp?.billingHistory?.[0]?.type === "Invoice" ||
            getResp?.billingHistory?.[0]?.type === "Payment").toBeTruthy();
    });
    it("should get invoice CSV by UUID", async () => {
        const expectedResponse = "product,group_description,";
        nock(baseUrl)
            .get(`/v2/customers/my/invoices/${invoiceUuid}/csv`)
            .reply(200, expectedResponse);
        const getResp = await client.v2.customers.my.invoices.byInvoice_uuid(invoiceUuid).csv.get();
        expect(getResp).not.toBeNull();
        const decodedResp = new TextDecoder('utf-8').decode(getResp);
        expect(decodedResp).toContain("product,group_description,");
    });
    it("should get invoice PDF by UUID", async () => {
        const expectedResponse = Buffer.from("mock-pdf-content");
        nock(baseUrl)
            .get(`/v2/customers/my/invoices/${invoiceUuid}/pdf`)
            .reply(200, expectedResponse);
        const getResp = await client.v2.customers.my.invoices.byInvoice_uuid(invoiceUuid).pdf.get();
        expect(getResp).not.toBeNull();
        const decodedResp = new TextDecoder('utf-8').decode(getResp);
        const filePath = "tests/integration/invoice.pdf";
        fs.writeFileSync(filePath, decodedResp);
        expect(fs.statSync(filePath).size).toBeGreaterThan(0);
        fs.unlinkSync(filePath);
    });
    it("should get invoice summary by UUID", async () => {
        const expectedResponse = {
            user_company: "DigitalOcean",
        };
        nock(baseUrl)
            .get(`/v2/customers/my/invoices/${invoiceUuid}/summary`)
            .reply(200, expectedResponse);
        const getResp = await client.v2.customers.my.invoices.byInvoice_uuid(invoiceUuid).summary.get();
        expect(getResp).not.toBeNull();
        expect(getResp?.userCompany).toBe("DigitalOcean");
    });
});
