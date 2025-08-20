# Contributing to the DO TypeScript Client

>First: if you're unsure or afraid of anything, just ask or submit the issue or pull request anyways. You won't be yelled at for giving your best effort. The worst that can happen is that you'll be politely asked to change something. We appreciate all contributions!

## Here's a Quick Overview

The DigitalOcean TypeScript client is generated using [Kiota](https://github.com/microsoft/kiota). The Kiota tool generates client libraries for accessing RESTful web services. Input to Kiota is a spec that describes the DigitalOcean REST API using the OpenAPI 3.0 Specification format. The spec can be found [here](https://github.com/digitalocean/openapi).

## Generating DoTs Locally

DoTs is a generated client. This section will walk you through generating the client locally. One might ask, when would one want to generate DoTs locally? Local generation is really helpful when making changes to the client configuration itself. It is good practice to re-generate the client to ensure the behavior is as expected.

### Prerequisites

* NodeJs version: >= 18 
* [npm](https://www.npmjs.com/): To manage TypeScript/JavaScript dependencies
* [Kiota](https://github.com/microsoft/kiota): The tool that generates the client libraries for accessing RESTful web services.

### Setup

1. Clone this repository. Run:

    ```sh
    git clone git@github.com:digitalocean/dots.git
    cd dots
    ```
2. Install Dependencies, Run:

   ```sh
   npm install
   ```

### Using `make` commands to re-generate the client

1. Remove the previous generated code.

    ```sh
    make clean
    ```

2. Re-download the latest DO OpenAPI 3.0 Specification.

    ```sh
    make download-spec
    ```

3. Generate the client

    ```sh
    make generate
    ```

4. Compile all TypeScript Generated files

   ```sh
   npm run build
   ```

5.  It is also good practice to run mock tests against the changes using the following make command:

    ```sh
    make test-mocked
    ```
    
# **Tests**

>The tests included in this repo are used to validate the generated client.
We use `jest` to define and run the tests.

**_Requirements_**
- [NodeJS 18 or above](https://nodejs.org/en/)
- [TypeScript 5 or above](https://www.typescriptlang.org/)
- [Jest 30 or above](https://www.npmjs.com/package/jest) 
- A DigitalOcean account with an active subscription. Along with a DigitalOcean token with proper permissions to manage DigitalOcean resources (for integration testing).
- `"type": "module"` in your `package.json` (for ES module support)
  
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

#### Integration Tests: `tests/integration/`

Tests in the `integration` directory include tests that simulate specific
scenarios a customer might use the client for to interact with the API.
**_IMPORTANT:_** these tests require a valid API token and **_DO_** create real
resources on the respective DigitalOcean account. make sure you have correct access

To run integration tests, run:

```shell
 make test-integration file=droplet.test.ts
```

# **Code Generation Tool (Kiota) Behaviors**
> This section outlines Kiota's behaviors and transformations in API request and response handling.
### Parameter Case Conversion
- Kiota automatically converts parameters sent in snake_case to camelCase when generating API requests, ensuring consistency with standard naming conventions and TypeScript's camelCase practices
### Reserved Keyword Handling
- Kiota modifies reserved keywords to avoid conflicts and ensure compatibility.
- For example: ``default : true`` to ``deaultEscaped : true``.


## Releasing `dots`

The repo uses GitHub workflows to publish a draft release when a new tag is
pushed. We use [semver](https://semver.org/#summary) to determine the version
number for the tag.

1. Run `make changes` to review the merged PRs since last release and decide what kind of release you are doing (bugfix, feature or breaking).
    * Review the tags on each PR and make sure they are categorized
      appropriately.

1. Run `BUMP=(bugfix|feature|breaking) make bump_version` to update the `pydo`
   version.  
`BUMP` also accepts `(patch|minor|major)`  

    Command example:

    ```bash
    make BUMP=minor bump_version
    ```  

1. Create a separate PR with only version changes.

1. Once the PR has been pushed and merged, tag the commit to trigger the
   release workflow: run `make tag` to tag the latest commit and push the tag to ORIGIN.

   Notes:
    * To tag an earlier commit, run `COMMIT=${commit} make tag`.
    * To push the tag to a different remote, run `ORIGIN=${REMOTE} make tag`.

1. Once the release process completes, review the draft release for correctness and publish the release.  
Ensure the release has been marked `Latest`.