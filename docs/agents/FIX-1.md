You are a principal platform engineer tasked with fixing and standardizing the local/dev environment for ABAPer.

This must be a clean rebuild of the local development stack.
No patching.
No incremental duct-taping.
We are eliminating config drift permanently.

============================================================
SYSTEM CONTEXT
============================================================

Product: ABAPer (Cloud IDE with LLM/Agent integration)

Architecture components:

Identity:
- Keycloak (external PRD realm used for dev)
- PRD is source of truth for realm + env configuration
- We DO NOT containerize keycloak for dev

Gateway:
- abaper-gw (Krakend)

Frontend:
- abaper-editor (Vite + TypeScript)

Backend:
- abaper-bff (Go)
- abaper-ts (ADT service, Node/TS)
- cai-llm-router
- abaper-mcp

Infra:
- NATS (no auth required for dev)

Nginx NOT required for dev.

Docker network name must be:
trm-network

============================================================
CRITICAL DESIGN PRINCIPLES
============================================================

1. PRD is configuration source of truth.
2. GitHub Secrets contain canonical environment variables.
3. Dev must be config-parity aligned with PRD.
4. We eliminate env drift by:
   - Running `printenv` inside PRD containers
   - Generating a sanitized .env.dev baseline
   - Removing runtime-only variables
5. All services load env from:
   --env-file .env.dev
6. No hardcoded environment variables in docker-compose.
7. Internal service communication uses container DNS.
8. No localhost cross-service calls.
9. Deterministic startup ordering with healthchecks.
10. Compose spec version 3.9 only.

============================================================
OBJECTIVES
============================================================

Produce a fully working local/dev environment with:

1. docker-compose.dev.yml
2. Makefile
3. Example .env.dev (generated pattern from printenv)
4. Dockerfile.dev for:
   - Go services (with air)
   - Node services (ts-node-dev)
   - Vite frontend
5. Script:
   scripts/extract-env.sh
   That:
      - Uses docker exec <prd-container> printenv
      - Filters unwanted variables
      - Writes .env.dev
      - Deduplicates keys
6. Directory structure diagram
7. Explicit service dependency graph
8. Health checks for:
   - NATS
   - BFF
   - Gateway
9. Restart policies
10. Named network:
   trm-network
11. All images tagged:
   beta

============================================================
HOT RELOAD REQUIREMENTS
============================================================

Frontend:
- Vite dev server
- Port 5173
- Bind mount
- CHOKIDAR_USEPOLLING=true
- NODE_ENV=development

Go services:
- Use air
- Bind mount source
- Do not rebuild image on every code change

Node services:
- ts-node-dev
- Bind mount source

============================================================
MAKEFILE REQUIREMENTS
============================================================

Must include:

make build
make up
make down
make logs
make restart
make clean
make dev-rebuild SERVICE=<service>

make extract-env
    → calls scripts/extract-env.sh

make validate-env
    → ensures required variables exist
    → fails fast if missing

============================================================
ENV DISCIPLINE
============================================================

Claude must:

1. Define required environment variables per service.
2. Show example .env.dev with realistic placeholders.
3. Explain how GitHub Secrets map to .env.dev.
4. Ensure no secret is committed accidentally.
5. Add .env.dev to .gitignore.

============================================================
SERVICE NAMING (STRICT)
============================================================

abaper-editor
abaper-bff
abaper-ts
abaper-gw
abaper-mcp
cai-llm-router
nats

============================================================
NETWORKING
============================================================

Single external bridge network:

trm-network

If not exists:
docker network create trm-network

All services must attach to it.

============================================================
ANTI-PATTERNS TO AVOID
============================================================

- No inline environment variables in compose
- No container rebuilding for code change
- No localhost URLs between containers
- No depends_on without healthchecks
- No duplicated port exposure
- No legacy docker-compose v2 syntax
- No implicit default networks

============================================================
BONUS
============================================================

Add optional profile:

profile: debug

That enables:
- Extra verbose logging
- Exposes Go pprof
- Exposes Node inspector

============================================================
FINAL OUTPUT FORMAT
============================================================

Provide:

1. docker-compose.dev.yml
2. Makefile
3. scripts/extract-env.sh
4. Dockerfile.dev files
5. Example .env.dev
6. Directory structure tree
7. Service dependency explanation
8. Failure modes this fixes

No theory.
No commentary.
No TODOs.
Only concrete implementation.

This must work.
