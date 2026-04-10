# Local Development

Run the full ABAPer stack locally: all backends in Docker, frontend with Vite HMR.

## Prerequisites

- Docker with Compose v2+
- Node.js 20+
- Source repos cloned as siblings (see [Repository Layout](#repository-layout))

## Quick Start

```bash
# 1. One-time setup
cp .env.template .env.dev          # fill in SAP creds + GH_PAT
make up                            # build & start all backends

# 2. Development (two terminals)
make watch                         # terminal 1: BFF hot-reload
make dev                           # terminal 2: frontend HMR
```

Open http://localhost:5173.

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make up` | Build + start all backend services (detached) |
| `make dev` | Frontend dev server (`LOCAL=1 npm run dev`) |
| `make all` | `make up` + `make dev` in one command |
| `make watch` | Compose Watch — auto-rebuilds BFF on source changes |
| `make down` | Stop all services |
| `make logs` | Tail logs from all services |
| `make log s=<name>` | Tail a single service (e.g. `make log s=abaper-bff`) |
| `make clean` | Stop + remove containers, volumes, orphans |

## Services

| Service | Host Port | Container Port | Source |
|---------|-----------|----------------|--------|
| **abaper-editor** | 5173 | — | Vite HMR (native) |
| **abaper-ts** | 8085 | 8080 | `abaper-ts/` |
| **abaper-mcp** | 8015 | 8015 | `abaper-mcp/` |
| **abaper-go** | 8086 | 8086 | `abaper/` |
| **abaper-bff** | 8084 | 8080 | `abaper-bff/` |
| **cai-llm-router** | — | — | `cai-llm-router/` |
| **nats** | 4222 | 4222 | NATS server (JetStream enabled) |
| **gateway** | 8083 | 8083 | `abaper-gw/` |

## Request Routing (LOCAL mode)

When running `LOCAL=1 npm run dev`, Vite proxies requests as follows:

```
Browser (:5173)
  │
  ├── /api/v1/github/*  → abaper-go     (:8086)
  ├── /api/*            → gateway        (:8083) → abaper-ts
  ├── /ai/agent/github  → github-mcp     (:8020)  (direct, no BFF)
  ├── /ai/agent/*       → abaper-bff     (:8084) → abaper-mcp
  └── /ai/*             → abaper-bff     (:8084) → cai-llm-router
```

The BFF handles internal routing to `abaper-mcp` and `cai-llm-router`, matching the production path.

## Proxy Modes

| Env Var | `/api/*` | `/ai/agent` | `/ai/chats/*` |
|---------|----------|-------------|---------------|
| `LOCAL=1` | gateway (8083) | BFF (8084) | BFF (8084) |
| `NOAUTH=1` | abaper-ts (8085) direct | abaper-mcp (8015) direct | production |
| *(none)* | production | production | production |

## Environment Variables

Copy `.env.template` to `.env.dev` and fill in:

```env
SAP_HOST=https://your-sap-system.example.com
SAP_CLIENT=100
SAP_USERNAME=your_user
SAP_PASSWORD=your_password

GITHUB_CLIENT_ID=Ov23li2XoloIy5OdKjKJ
GITHUB_CLIENT_SECRET=your_secret
GH_PAT=ghp_your_token
```

`GH_PAT` is also used as a build arg for Go services that pull private modules.

## Hot Reload

- **Frontend**: Vite HMR — instant updates on file save
- **Go services** (abaper-mcp, cai-llm-router, abaper-bff): Air watches for `.go` and `.yaml` changes, auto-rebuilds (~2-3s). Source is bind-mounted.
- If air misses a change, restart manually: `docker compose -f docker-compose.dev.yml restart <service>`

## Repository Layout

The Compose file expects sibling repos relative to `abaper-editor/`:

```
~/Downloads/src/
├── abaper-editor/          ← you are here
├── abaper-ts/
├── abaper-mcp/
├── abaper/                 ← abaper-go
├── abaper-bff/
├── cai-llm-router/
├── cai-bff/

~/src/
└── abaper-gw/
```

## Troubleshooting

**`network trm-network not found`**
```bash
docker network create trm-network
```

**BFF can't reach backends**
Check that `abaper-ts` and `abaper-mcp` are healthy:
```bash
make log s=abaper-ts
make log s=abaper-mcp
```

**Port conflicts**
Another service may already be using a port. Check with:
```bash
lsof -i :8084   # or whichever port
```

## LLM Profile Management

LLM profiles let you change the abaper agent's system prompt, model, and constraints without restarting containers. Profiles are stored in NATS KV.

### Check current profile

```bash
# Tail cai-llm-router logs for profile info
docker compose -f docker-compose.dev.yml logs cai-llm-router 2>&1 | grep -i profile
```

On first run you'll see: `LLM profile manager initialized  profile=builtin env=prd`
This means no KV profile is active — `agents.yaml` / `prompts/abaper.md` is in effect.

### Seed a profile

```bash
# Exec into the NATS container
docker compose -f docker-compose.dev.yml exec nats sh

# Install nats CLI (one-time)
wget -qO /usr/local/bin/nats https://github.com/nats-io/natscli/releases/download/v0.1.5/nats-0.1.5-linux-amd64 && chmod +x /usr/local/bin/nats

# Create a profile
nats kv put llm-profiles abaper_default 'version: "1.0.0"
system_prompt: |
  You are an SAP ABAP development assistant with direct access to a live SAP system via MCP tools.
  Always use create-and-activate for creating or updating ABAP objects.
constraints:
  max_retries: 2
  repair_mode: true
  require_activation: true
'

# Activate it
nats kv put llm-profiles _active 'abaper_default'
```

### Verify hot-reload

```bash
# Watch for profile change in logs
docker compose -f docker-compose.dev.yml logs -f cai-llm-router 2>&1 | grep -i profile
# Should show: "Active profile changed" and "Profile loaded"
```

### Switch profiles

```bash
# Create a verbose profile for debugging
nats kv put llm-profiles abaper_verbose 'version: "0.1.0"
system_prompt: "You are a test assistant. Start every response with [VERBOSE MODE]."
constraints:
  max_retries: 5
'

# Hot-swap (no restart needed)
nats kv put llm-profiles _active 'abaper_verbose'

# Roll back
nats kv put llm-profiles _active 'abaper_default'
```

### Environment overrides

Set `PROFILE_ENV=dev` in `.env.dev` to enable dev-specific overrides defined in the profile YAML. Default is `prd`.
