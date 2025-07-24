LOCAL_SPEC_FILE=./DigitalOcean-public.v2.yaml

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'; \
	printf "\nNOTE: Run 'SPEC_FILE=path/to/local/spec make generate' to skip the download and use a local spec file.\n"

.PHONY: download-spec
download-spec: ## Download Latest DO Spec
	@echo Downloading published spec; \
	touch DigitalOcean-public.v2.yaml && \
	curl https://api-engineering.nyc3.digitaloceanspaces.com/spec-ci/DigitalOcean-public.v2.yaml -o $(LOCAL_SPEC_FILE)


.PHONY: clean
clean: ## Remove kiota generated files and directories
	@echo Cleaning up generated files and directories; \
	rm -rf src/dots/digitalOceanClient.ts src/dots/digitalOceanClient.js src/dots/models src/dots/v2 src/dots/.kiota.log src/dots/kiota-lock.json

.PHONY: dev-dependencies
dev-dependencies: ## Install development tooling
	npm install --only=dev

.PHONY: lint
lint: ## Run linter on code base
	@echo Running typescript linter
	npm run lint

.PHONY: test
test: ## Running all test cases
	@echo Running all test cases
	npm test

.PHONY: test-mocked
test-mocked: ## Running mocked test cases
	@echo Running all mocked test cases
	npm run test:mock

.PHONY: test-integration
test-integration: ## Running mocked test cases
	@echo Running all integration test cases
	npm run test:integration

.PHONY: test-single
test-single: ## Running single integration test case
	@echo Running tests/integration/$(file) test cases
	npm run test:single tests/integration/$(file)

.PHONY: docs_clean
docs_clean: ## Remove generated documents
	@echo Cleaning up generated document; \
	rm -rf docs

.PHONY: generate-docs
generate-docs: ## generate typescript client documentation
	@echo Running typescript linter
	npm run docs

.PHONY: bump_version
bump_version: ## Bumps the version
	@echo "==> BUMP=${BUMP} bump_version"
	@echo ""
	@ORIGIN=${ORIGIN} scripts/bumpversion.sh

.PHONY: generate
ifndef SPEC_FILE
generate: SPEC_FILE = $(LOCAL_SPEC_FILE)
generate: download-spec ## Generates the typescript client using the latest published spec first.
endif
generate: dev-dependencies
	@printf "=== Generating client with spec: $(SPEC_FILE)\n\n"; \
	kiota generate -l typescript -d $(SPEC_FILE) -c DigitalOceanClient -o ./src/dots

.PHONY: tag
tag: ## Tags a release
	@echo "==> ORIGIN=${ORIGIN} COMMIT=${COMMIT} tag"
	@echo ""
	@ORIGIN=${ORIGIN} scripts/tag.sh
