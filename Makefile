LOCAL_SPEC_FILE=./DigitalOcean-public.v2.yaml

.PHONY: download-spec
download-spec: ## Download Latest DO Spec
	@echo Downloading published spec; \
	touch DigitalOcean-public.v2.yaml && \
	curl https://api-engineering.nyc3.digitaloceanspaces.com/spec-ci/DigitalOcean-public.v2.yaml -o $(LOCAL_SPEC_FILE)


.PHONY: clean
clean: ## Remove  kiota generated files and directories
	@echo Cleaning up generated files and directories; \
	rm -rf src/dots/digitalOceanClient.ts src/dots/digitalOceanClient.js src/dots/models src/dots/v2 src/dots/.kiota.log src/dots/kiota-lock.json

.PHONY: dev-dependencies
dev-dependencies: ## Install development tooling
	npm install --only=dev

.PHONY: generate
ifndef SPEC_FILE
generate: SPEC_FILE = $(LOCAL_SPEC_FILE)
generate: download-spec ## Generates the typescript client using the latest published spec first.
endif
generate: dev-dependencies
	@printf "=== Generating client with spec: $(SPEC_FILE)\n\n"; \
	kiota generate -l typescript -d $(SPEC_FILE) -c DigitalOceanClient -o ./src/dots