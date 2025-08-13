/**
 account.test.ts
 */
import nock from "nock";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";



const baseUrl = "https://api.digitalocean.com";
const token = "test-token";
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);


const EXPECTED_ACCOUNT = {
  account: {
    droplet_limit: 25,
    floating_ip_limit: 5,
    email: 'sammy@digitalocean.com',
    uuid: 'b6fr89dbf6d9156cace5f3c78dc9851d957381ef',
    email_verified: true,
    status: 'active',
    status_message: ' ',
    team: {
      uuid: '5df3e3004a17e242b7c20ca6c9fc25b701a47ece',
      name: 'My Team',
    },
  },
};
const EXPECTED_ACCOUNT_RESPONSE = {
  account: {
    dropletLimit: 25,
    floatingIpLimit: 5,
    email: 'sammy@digitalocean.com',
    uuid: 'b6fr89dbf6d9156cace5f3c78dc9851d957381ef',
    emailVerified: true,
    status: 'active',
    statusMessage: ' ',
    team: {
      uuid: '5df3e3004a17e242b7c20ca6c9fc25b701a47ece',
      name: 'My Team',
    },
  },
};

describe('Account API Resource', () => {
    afterEach(() => {
    nock.cleanAll();
  });

  it('should mock the account get operation', async () => {
    nock(baseUrl)
      .get('/v2/account')
      .reply(200, EXPECTED_ACCOUNT);

    const account = await client.v2.account.get();

    expect(account).toEqual(EXPECTED_ACCOUNT_RESPONSE);
  });
});