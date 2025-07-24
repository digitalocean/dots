# dots
`dots` is the official DigitalOcean Typescript Client based on the DO OpenAPIv3 specification. 

# Getting Started
## Prerequisites 
- [NodeJS 18 or above](https://nodejs.org/en/)
- [TypeScript 5 or above](https://www.typescriptlang.org/)
- A DigitalOcean account with an active subscription. Along with a DigitalOcean token with proper permissions to manage DigitalOcean resources.

## Installation

To install the dependencies for this repository, use the following command:

1. Clone this repo. The client is not published anywhere currently. 
2. Install the dependencies for this repository. Run this command at the root of the repo:
```
npm install
```

## Quick Start
### Authenticating 
`dots` must be initialized with `createDigitalOceanClient()`. A DigitalOcean token is required. This token can be passed in via `DigitalOceanApiKeyAuthenticationProvider()`, an example below:
```
const authProvider = new DigitalOceanApiKeyAuthenticationProvider(token!);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);
// Create the API client
const client = createDigitalOceanClient(adapter);
```

### Managing DigitalOcean Resources via dots
Find below a working example of creating a DigitalOcean volume via `dots`:
```
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import { createDigitalOceanClient } from "../src/dots/digitalOceanClient.js";
import { DigitalOceanApiKeyAuthenticationProvider } from '../src/dots/DigitalOceanApiKeyAuthenticationProvider.js';
import {Volumes_ext4} from "../src/dots/models/index.js";

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

# **Contributing**

>Visit our [Contribuing Guide](CONTRIBUTING.md) for more information on getting
involved in developing this client.

# **Tests**

>The tests included in this repo are used to validate the generated client.
We use `jest` to define and run the tests.

There are two types of test suites in the `tests/` directory.

#### Mocked Tests: `tests/mocked/`

Tests in the `mocked` directory include:

- tests that validate the generated client has all the expected classes and
  methods for the respective API resources and operations.
- tests that exercise individual operations against mocked responses.

These tests do not act against the real API so no real resources are created.

To run mocked tests, run:

```shell
make test-mocked
```
# **Known Issues**

>This selection lists the known issues of the client generator.

## Generates nested value fields for nested arrays

- This is an existing issue with Kiota
- Converts fields which have `default` key to `defaultEscaped` 


# **A Full Documentation can be found here**

> https://digitaloceandots.readthedocs.io/en/latest/

