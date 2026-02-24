COMPOSE := docker compose -f docker-compose.dev.yml

.PHONY: network up build watch dev all down logs log clean \
        restart dev-rebuild extract-env validate-env debug dev-docker

## First-time setup: create the shared Docker network
network:
	docker network create trm-network 2>/dev/null || true

## Build all Docker images
build: network
	$(COMPOSE) build

## Start all backend services (detached)
up: network
	$(COMPOSE) up --build -d

## Start Compose Watch for BFF hot-reload (runs in foreground)
watch:
	$(COMPOSE) watch

## Start frontend dev server with HMR (LOCAL mode -> routes through BFF)
dev:
	LOCAL=1 npm run dev

## Start everything: backends (detached) + frontend (foreground)
all: up dev

## Stop all services
down:
	$(COMPOSE) down

## Tail logs from all services
logs:
	$(COMPOSE) logs -f

## Tail logs from a single service: make log s=abaper-bff
log:
	$(COMPOSE) logs -f $(s)

## Stop and remove containers, networks, and volumes
clean:
	$(COMPOSE) down -v --remove-orphans

## Restart a single service: make restart s=abaper-bff
restart:
	$(COMPOSE) restart $(s)

## Rebuild a single service without deps: make dev-rebuild s=abaper-bff
dev-rebuild:
	$(COMPOSE) up --build -d --no-deps $(s)

## Extract env vars from PRD containers into .env.dev
extract-env:
	bash scripts/extract-env.sh

## Validate that required vars exist in .env.dev
validate-env:
	@if [ ! -f .env.dev ]; then \
		echo "ERROR: .env.dev not found. Run: cp .env.template .env.dev"; \
		exit 1; \
	fi
	@missing=0; \
	for var in SAP_HOST SAP_CLIENT SAP_USERNAME SAP_PASSWORD \
	           GITHUB_CLIENT_ID GH_PAT \
	           ANTHROPIC_API_KEY \
	           ABAPER_MODE ABAPER_HTTP_PORT ABAPER_TS_URL \
	           ABAPER_BFF_SERVER_PORT ABAPER_BFF_BACKENDS_ABAPER_TS \
	           ABAPER_BFF_BACKENDS_ABAPER ABAPER_BFF_BACKENDS_ABAPER_MCP \
	           ABAPER_BFF_BACKENDS_LLM_ROUTER \
	           NATS_URL; do \
		if ! grep -q "^$$var=" .env.dev; then \
			echo "MISSING: $$var"; \
			missing=1; \
		fi; \
	done; \
	if [ $$missing -eq 1 ]; then \
		echo ""; \
		echo "Some required variables are missing from .env.dev"; \
		exit 1; \
	fi
	@echo "All required variables present in .env.dev"

## Start with debug overlay (verbose logging, pprof, inspector)
debug: network
	docker compose -f docker-compose.dev.yml -f docker-compose.debug.yml up --build -d

## Start frontend in Docker via profile (alternative to native dev)
dev-docker: network
	$(COMPOSE) --profile frontend up --build -d
