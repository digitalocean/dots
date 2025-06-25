import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { DigitalOceanApiKeyAuthenticationProvider } from '../src/dots/DigitalOceanApiKeyAuthenticationProvider.js';
import { createDigitalOceanClient } from "../src/dots/digitalOceanClient.js";
import 'dotenv/config';
const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN not set");
}
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token);
const adapter = new FetchRequestAdapter(authProvider);
const client = createDigitalOceanClient(adapter);
async function main() {
    try {
        const keyName = process.env.SSH_KEY_NAME;
        if (!keyName) {
            throw new Error("SSH_KEY_NAME not set");
        }
        const sshKey = await findSshKey(keyName);
        const tags = {
            per_page: 30
        };
        const droplets = await listDroplets(tags);
        const firstDroplet = droplets?.[0];
        let firstDropletId = null;
        let getDropletDetails = null;
        if (firstDroplet && typeof firstDroplet.id === 'number') {
            firstDropletId = firstDroplet.id;
        }
        else {
            console.log("No valid droplet found to get details.");
            return;
        }
        getDropletDetails = await getDropletInfo(firstDropletId);
        console.log(getDropletDetails);
        const PowerOnDroplet = await PowerOnDropletByID(firstDropletId);
        console.log(PowerOnDroplet);
        console.log("**************");
        console.log('Done!!');
    }
    catch (err) {
        console.error(err);
    }
}
async function findSshKey(name) {
    console.log(`Looking for SSH key named ${name}...`);
    let page = 1;
    let paginated = true;
    while (paginated) {
        try {
            const resp = await client.v2.account.keys.get();
            if (resp && resp.sshKeys) {
                for (const k of resp.sshKeys) {
                    if (k.name === name) {
                        console.log(`Found SSH key: ${k.fingerprint}`);
                        return k;
                    }
                }
                const pages = resp.links?.pages;
                if (pages && 'next' in pages) {
                    const nextUrl = pages.next;
                    if (nextUrl) {
                        const parsedUrl = new URL(nextUrl);
                        const nextPage = parseInt(parsedUrl.searchParams.get("page"));
                        console.log(`Next page: ${nextPage}`);
                    }
                    else {
                        paginated = false;
                    }
                }
                else {
                    console.log("No next page available");
                    paginated = false;
                }
            }
            else {
                throw new Error("Failed to retrieve SSH keys");
            }
        }
        catch (err) {
            console.error(`Error: ${err}`);
            throw err;
        }
    }
    throw new Error("No SSH key found");
}
async function listDroplets(tags) {
    console.log(`listing all Droplets`);
    console.log(tags);
    try {
        const resp = await client.v2.droplets.get({ queryParameters: tags });
        if (resp && 'meta' in resp) {
            const total = resp.meta?.total;
            console.log(`Total no of droplets ${JSON.stringify(total)}`);
            console.log(`************************`);
            const droplets = resp;
            return droplets.droplets;
        }
    }
    catch (err) {
        console.log(err);
    }
}
async function getDropletInfo(dropletId) {
    console.log(`First DropletInfo`);
    try {
        const resp = await client.v2.droplets.byDroplet_id(dropletId).get();
        if (resp && 'droplet' in resp) {
            return resp.droplet;
        }
    }
    catch (err) {
        console.error(err);
    }
}
async function PowerOnDropletByID(dropletId) {
    console.log(`Powering on the Droplet`);
    try {
        const req = {
            type: 'power_off'
        };
        const actionResp = await client.v2.droplets.byDroplet_id(dropletId).actions.post(req);
        console.log(actionResp);
        if (actionResp?.action?.id !== undefined && actionResp.action.id !== null) {
            await waitForAction(actionResp.action.id);
        }
        else {
            throw new Error("Action ID is undefined or null");
        }
        const actionDone = await client.v2.actions.byAction_id(actionResp.action.id).get();
        return actionDone;
    }
    catch (err) {
        console.error(err);
    }
}
async function waitForAction(id, wait = 5) {
    console.log(`Waiting for action ${id} to complete...`, "", { flush: true });
    let status = "in-progress";
    while (status === "in-progress") {
        try {
            const resp = await client.v2.actions.byAction_id(id).get();
            if (resp && resp.action) {
                status = resp.action.status;
            }
            else {
                throw new Error("Response or action is undefined");
            }
            if (status === "in-progress") {
                process.stdout.write(".");
                await new Promise(resolve => setTimeout(resolve, wait * 1000));
            }
            else if (status === "errored") {
                throw new Error(`${resp.action.type} action ${resp.action.id} ${status}`);
            }
            else {
                console.log(".");
            }
        }
        catch (err) {
            if (err instanceof Error && 'statusCode' in err) {
                const httpError = err;
                throw new Error(`Error: ${httpError.statusCode} ${httpError.message}: ${httpError.response?.bodyAsText}`);
            }
            else {
                throw err;
            }
        }
    }
}
main();
