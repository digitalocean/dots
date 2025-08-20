# DoTs
`DoTs` is the official DigitalOcean Typescript Client based on the DO OpenAPIv3 specification. 

# Getting Started
## Prerequisites 
- [NodeJS 18 or above](https://nodejs.org/en/)
- [TypeScript 5 or above](https://www.typescriptlang.org/)
- A DigitalOcean account with an active subscription. Along with a DigitalOcean token with proper permissions to manage DigitalOcean resources.

## Installation

> The preferred way to install the DoTs for Node.js is to use the npm package manager for Node.js. \
> Simply type the following into a terminal window:
```shell
npm i @digitalocean/dots
```
## **The entire documentation is available at this link.**

> https://digitaloceandots.readthedocs.io/en/latest/

## `DoTs` **Quick Start**
> A quick guide to getting started with client
### Authenticating 
`dots` must be initialized with `createDigitalOceanClient()`. A DigitalOcean token is required. This token can be passed in via `DigitalOceanApiKeyAuthenticationProvider()`, an example below:
```typescript
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token!);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);
// Create the API client
const client = createDigitalOceanClient(adapter);
```

### Managing DigitalOcean Resources via dots
Find below a working example of creating a DigitalOcean volume via `dots`:
```typescript
import { createDigitalOceanClient, DigitalOceanApiKeyAuthenticationProvider,
 FetchRequestAdapter, Volumes_ext4 } from "@digitalocean/dots";

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) {
    throw new Error("DIGITALOCEAN_TOKEN not set");
}

const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token!);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);
// Create the API client
const client = createDigitalOceanClient(adapter);

async function main(): Promise<void> {
    try {
        const volumeReq: Volumes_ext4 = {
            sizeGigabytes: 10,
            name: `test-volume`,
            description: "Block storage testing",
            region: "nyc3",
            filesystemType: "ext4",
        };

        const resp = await client.v2.volumes.post(volumeReq);
        if (resp && resp.volume) {
            const volume = resp.volume;
            console.log(`Created volume ${volume.name} <ID: ${volume.id}>`);
        } else {
            throw new Error("Failed to create volume or volume is undefined");
        }

        console.log("Done!");

    } catch (err) {
        console.error(err);
    }
}

main();
```

Running the above code snippet with `tsc && node index.js` would output the following:
```
Created volume test-volume <ID: 751d0c09-1613-11f0-8aa5-0a58ac147241>
Done!
```

More working examples can be found in `dots/examples`. 

# **Known Issues**

>This section lists the known issues of the client generator.
### Generates nested value fields for nested arrays
-  This is an existing issue with our code generated tool, Kiota
-  More details about this issue can be found [here](https://github.com/microsoft/kiota/issues/4549)


# **Contributing**
>We welcome contributions! Feel free to get involved in developing this client by visiting our [Contribuing Guide](CONTRIBUTING.md) for detailed information and guidelines.
>For feature requests or bug reports, open an issue to help us improve the client.

# **License**

This project is licensed under the Apache License 2.0. See the [LICENSE](./LICENSE) file for details.
