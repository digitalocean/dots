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
   tsc
   ```

5.  It is also good practice to run mock tests against the changes using the following make command:

    ```sh
    make test-mocked
    ```
    



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
