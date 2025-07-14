/**
 * Integration Test for Billing
 */

import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { App_metrics_bandwidth_usage_request, App_propose, Apps_assign_app_alert_destinations_request, Apps_create_deployment_request, Apps_rollback_app_request } from "../../src/dots/models/index.js";
import { Apps_create_app_request } from "../../src/dots/models/index.js";
import { Apps_update_app_request } from "../../src/dots/models/index.js";
import { App_log_destination_definition } from "../../src/dots/models/index.js";

const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);

describe('Billing API Resource Tests', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should mock GET customer balance', async () => {
    const expected = {
      month_to_date_balance: '0.00',
      account_balance: '0.00',
      month_to_date_usage: '0.00',
      generated_at: '2019-07-09T15:01:12Z',
    };

    const typeExpected = {
      monthToDateBalance: '0.00',
      accountBalance: '0.00',
      monthToDateUsage: '0.00',
      generatedAt: new Date('2019-07-09T15:01:12Z')
    };

    nock(baseUrl)
      .get('/v2/customers/my/balance')
      .reply(200, expected);

    const balance = await client.v2.customers.my.balance.get();

    expect(balance).toEqual(typeExpected);
  });

  it('should mock GET billing history', async () => {
    const expected = {
      billing_history: [
        {
          description: 'Invoice for May 2018',
          amount: '12.34',
          invoice_id: '123',
          invoice_uuid: 'example-uuid',
          date: '2018-06-01T08:44:38Z',
          type: 'Invoice',
        },
        {
          description: 'Payment (MC 2018)',
          amount: '-12.34',
          date: '2018-06-02T08:44:38Z',
          type: 'Payment',
        },
      ],
      links: { pages: {} },
      meta: { total: 5 },
    };

    const typeExpected = {
      billingHistory: [
        {
          description: 'Invoice for May 2018',
          amount: '12.34',
          invoiceId: '123',
          invoiceUuid: 'example-uuid',
          date: new Date('2018-06-01T08:44:38Z'),
          type: 'Invoice',
        },
        {
          description: 'Payment (MC 2018)',
          amount: '-12.34',
          date: new Date('2018-06-02T08:44:38Z'),
          type: 'Payment',
        },
      ],
      links: { pages: {} },
      meta: { total: 5 },
    };

    nock(baseUrl)
      .get('/v2/customers/my/billing_history')
      .reply(200, expected);

    const balance = await client.v2.customers.my.billing_history.get();

    expect(balance).toEqual(typeExpected);
  });

  it('should mock GET a list of invoices', async () => {
    const expected = {
      invoices: [
        {
          invoice_uuid: '22737513-0ea7-4206-8ceb-98a575af7681',
          amount: '12.34',
          invoice_period: '2019-12',
        },
        {
          invoice_uuid: 'fdabb512-6faf-443c-ba2e-665452332a9e',
          amount: '23.45',
          invoice_period: '2019-11',
        },
      ],
      invoice_preview: {
        invoice_uuid: '1afe95e6-0958-4eb0-8d9a-9c5060d3ef03',
        amount: '34.56',
        invoice_period: '2020-02',
        updated_at: '2020-02-23T06:31:50Z',
      },
      links: { pages: {} },
      meta: { total: 70 },
    };

   const typeExpected = {
      invoices: [
        {
          invoiceUuid: '22737513-0ea7-4206-8ceb-98a575af7681',
          amount: '12.34',
          invoicePeriod: '2019-12',
        },
        {
          invoiceUuid: 'fdabb512-6faf-443c-ba2e-665452332a9e',
          amount: '23.45',
          invoicePeriod: '2019-11',
        },
      ],
      invoicePreview: {
        invoiceUuid: '1afe95e6-0958-4eb0-8d9a-9c5060d3ef03',
        amount: '34.56',
        invoicePeriod: '2020-02',
        updatedAt: '2020-02-23T06:31:50Z',
      },
      links: { pages: {} },
      meta: { total: 70 },
    };

    nock(baseUrl)
      .get('/v2/customers/my/invoices')
      .reply(200, expected);

    const balance = await client.v2.customers.my.invoices.get();

    expect(balance).toEqual(typeExpected);
  });

  it('should mock GET a list of invoices with pagination', async () => {
    const expected = {
      invoices: [
        {
          invoice_uuid: '22737513-0ea7-4206-8ceb-98a575af7681',
          amount: '12.34',
          invoice_period: '2019-12',
        },
        {
          invoice_uuid: 'fdabb512-6faf-443c-ba2e-665452332a9e',
          amount: '23.45',
          invoice_period: '2019-11',
        },
      ],
      invoice_preview: {
        invoice_uuid: '1afe95e6-0958-4eb0-8d9a-9c5060d3ef03',
        amount: '34.56',
        invoice_period: '2020-02',
        updated_at: '2020-02-23T06:31:50Z',
      },
      links: {
        pages: {
          next: 'https://api.digitalocean.com/v2/customers/my/invoices?page=2&per_page=20',
          last: 'https://api.digitalocean.com/v2/customers/my/invoices?page=6&per_page=20',
        },
      },
      meta: { total: 6 },
    };

    const typeExpected = {
      invoices: [
        {
          invoiceUuid: '22737513-0ea7-4206-8ceb-98a575af7681',
          amount: '12.34',
          invoicePeriod: '2019-12',
        },
        {
          invoiceUuid: 'fdabb512-6faf-443c-ba2e-665452332a9e',
          amount: '23.45',
          invoicePeriod: '2019-11',
        },
      ],
      invoicePreview: {
        invoiceUuid: '1afe95e6-0958-4eb0-8d9a-9c5060d3ef03',
        amount: '34.56',
        invoicePeriod: '2020-02',
        updatedAt: '2020-02-23T06:31:50Z',
      },
      links: {
        pages: {
          next: 'https://api.digitalocean.com/v2/customers/my/invoices?page=2&per_page=20',
          last: 'https://api.digitalocean.com/v2/customers/my/invoices?page=6&per_page=20',
        },
      },
      meta: { total: 6 },
    };



    const params = { per_page: 20, page: 1 };

    nock(baseUrl)
      .get('/v2/customers/my/invoices')
      .query(params)
      .reply(200, expected);

    const balance = await client.v2.customers.my.invoices.get({
      queryParameters: params
    });

    expect(balance).toEqual(typeExpected);
  });

  it('should mock GET invoice by UUID', async () => {
    const expected = {
      invoice_items: [
        {
          product: 'Kubernetes Clusters',
          resource_uuid: '711157cb-37c8-4817-b371-44fa3504a39c',
          group_description: 'my-doks-cluster',
          description: 'a56e086a317d8410c8b4cfd1f4dc9f82',
          amount: '12.34',
          duration: '744',
          duration_unit: 'Hours',
          start_time: '2020-01-01T00:00:00Z',
          end_time: '2020-02-01T00:00:00Z',
        },
        {
          product: 'Spaces Subscription',
          description: 'Spaces ($5/mo 250GB storage & 1TB bandwidth)',
          amount: '34.45',
          duration: '744',
          duration_unit: 'Hours',
          start_time: '2020-01-01T00:00:00Z',
          end_time: '2020-02-01T00:00:00Z',
        },
      ],
      links: { pages: {} },
      meta: { total: 6 },
    };

    const typeExpected = {
      invoiceItems: [
        {
          product: 'Kubernetes Clusters',
          resourceUuid: '711157cb-37c8-4817-b371-44fa3504a39c',
          groupDescription: 'my-doks-cluster',
          description: 'a56e086a317d8410c8b4cfd1f4dc9f82',
          amount: '12.34',
          duration: '744',
          durationUnit: 'Hours',
          startTime: '2020-01-01T00:00:00Z',
          endTime: '2020-02-01T00:00:00Z',
        },
        {
          product: 'Spaces Subscription',
          description: 'Spaces ($5/mo 250GB storage & 1TB bandwidth)',
          amount: '34.45',
          duration: '744',
          durationUnit: 'Hours',
          startTime: '2020-01-01T00:00:00Z',
          endTime: '2020-02-01T00:00:00Z',
        },
      ],
      links: { pages: {} },
      meta: { total: 6 },
    };

    nock(baseUrl)
      .get('/v2/customers/my/invoices/1')
      .reply(200, expected);

    const balance = await client.v2.customers.my.invoices.byInvoice_uuid("1").get();

    expect(balance).toEqual(typeExpected);
  });

  it('should mock GET invoice CSV by UUID', async () => {
    const expected = 'product,group_description,description,hours,start,end,USD,project_name,category';

    nock(baseUrl)
      .get('/v2/customers/my/invoices/1/csv')
      .reply(200, expected);

    const balance = await client.v2.customers.my.invoices.byInvoice_uuid("1").csv.get();
    if (balance) {
        const decodedBalance = new TextDecoder('utf-8').decode(balance)
        expect(decodedBalance).toEqual(expected);
    }
    else {
        throw new Error('The balance response is undefined');
    }
  });

  it('should mock GET invoice PDF by UUID', async () => {
    const expected = 'product,group_description,description,hours,start,end,USD,project_name,category';

    nock(baseUrl)
      .get('/v2/customers/my/invoices/1/pdf')
      .reply(200, expected);

    const invoices = await client.v2.customers.my.invoices.byInvoice_uuid("1").pdf.get();
    // const listIn = Array.from(invoices);
    if (invoices) {
        const decodedInvoice = new TextDecoder('utf-8').decode(invoices)
        expect(decodedInvoice).toEqual(expected);
    }
    else {
        throw new Error('The balance response is undefined');
    }
    // console.log('invoices: ',invoices);
  });

  it('should mock GET invoice summary by UUID', async () => {
    const expected = {
      invoice_uuid: '1',
      billing_period: '2020-01',
      amount: '27.13',
      user_name: 'Sammy Shark',
      user_billing_address: {
        address_line1: '101 Shark Row',
        city: 'Atlantis',
        region: 'OC',
        postal_code: '12345',
        country_iso2_code: 'US',
        created_at: '2019-09-03T16:34:46.000Z',
        updated_at: '2019-09-03T16:34:46.000Z',
      },
      user_company: 'DigitalOcean',
      user_email: 'sammy@digitalocean.com',
      product_charges: {
        name: 'Product usage charges',
        amount: '12.34',
        items: [
          { amount: '10.00', name: 'Spaces Subscription', count: '1' },
          { amount: '2.34', name: 'Database Clusters', count: '1' },
        ],
      },
      overages: { name: 'Overages', amount: '3.45' },
      taxes: { name: 'Taxes', amount: '4.56' },
      credits_and_adjustments: { name: 'Credits & adjustments', amount: '6.78' },
    };

    const typeExpected = {
      invoiceUuid: '1',
      billingPeriod: '2020-01',
      amount: '27.13',
      userName: 'Sammy Shark',
      userBillingAddress: {
        addressLine1: '101 Shark Row',
        city: 'Atlantis',
        region: 'OC',
        postalCode: '12345',
        countryIso2Code: 'US',
        createdAt: '2019-09-03T16:34:46.000Z',
        updatedAt: '2019-09-03T16:34:46.000Z',
      },
      userCompany: 'DigitalOcean',
      userEmail: 'sammy@digitalocean.com',
      productCharges: {
        name: 'Product usage charges',
        amount: '12.34',
        items: [
          { amount: '10.00', name: 'Spaces Subscription', count: '1' },
          { amount: '2.34', name: 'Database Clusters', count: '1' },
        ],
      },
      overages: { name: 'Overages', amount: '3.45' },
      taxes: { name: 'Taxes', amount: '4.56' },
      creditsAndAdjustments: { name: 'Credits & adjustments', amount: '6.78' },
    };

    nock(baseUrl)
      .get('/v2/customers/my/invoices/1/summary')
      .reply(200, expected);

    const invoice = await client.v2.customers.my.invoices.byInvoice_uuid("1").summary.get();

    expect(invoice).toEqual(typeExpected);
  });
});