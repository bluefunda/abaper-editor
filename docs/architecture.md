# ABAPer Editor Architecture

## System Overview

ABAPer Editor is a single-page application (SPA) that provides a browser-based ABAP IDE. It communicates with SAP systems through a chain of backend services.

```
┌─────────────────────────────────────────────────────┐
│  Browser (abaper-editor SPA)                        │
│  ├── Monaco Editor (ABAP syntax, completions)       │
│  ├── abaplint (client-side linting, no SAP needed)  │
│  ├── Keycloak JS (multi-realm authentication)       │
│  └── Zustand stores (editor, AI, settings state)    │
└─────────────┬───────────────────────┬───────────────┘
              │                       │
     /abaper/* REST              /ai/* Streaming
              │                       │
              ▼                       ▼
        ┌──────────────────────────────────┐
        │          abaper-gw               │
        │        KrakenD :8083             │
        │        JWT + CORS                │
        └──────┬───────────────────┬───────┘
               │                   │
        ┌──────┴───────┐    ┌──────┴───────┐
        │  abaper-ts   │    │  abaper-bff  │
        │ Express:8087 │    │   Go :8084   │
        │  ADT proxy   │    │  HTTP proxy  │
        └──────┬───────┘    └──┬────────┬──┘
               │               │        │
               ▼        ┌──────┘        └──────┐
        ┌──────────┐    │                      │
        │   SAP    │    ▼                      ▼
        │ (ADT API)│  ┌──────────────┐  ┌──────────────┐
        └──────────┘  │ abaper-mcp   │  │cai-llm-router│
                      │ (MCP tools)  │  │  (Temporal)  │
                      └──────┬───────┘  └──────────────┘
                             │
                      ┌──────┴───────┐
                      │  abaper-ts   │
                      │  (ADT proxy) │
                      └──────┬───────┘
                             │
                      ┌──────┴───────┐
                      │  SAP System  │
                      └──────────────┘
```

## Two Request Paths

### 1. Direct ADT Operations (REST)

User actions like "Save", "Activate", "Format", "Run Tests" go through the REST path:

```
Editor → abaper-gw → abaper-ts → SAP ADT
```

- **abaper-gw** validates JWT, propagates SAP credentials as headers
- **abaper-ts** translates JSON REST to SAP ADT XML/HTTP calls
- Results return synchronously as JSON

### 2. AI-Assisted Operations (Streaming)

Chat messages and MCP tool calls in the AI panel go through the BFF:

```
Editor → abaper-gw → abaper-bff → abaper-mcp / cai-llm-router
```

- **abaper-gw** validates JWT, routes `/ai/*` to abaper-bff
- **abaper-bff** is a thin HTTP reverse proxy that fans out to backends:
  - `/ai/agent/*` → **abaper-mcp** (MCP tools via Streamable HTTP)
  - `/ai/chats/*` → **cai-llm-router** (LLM orchestration)
- **cai-llm-router** orchestrates LLM calls with MCP tool execution
- **abaper-mcp** exposes ABAP operations as MCP tools the LLM can invoke
- MCP uses Streamable HTTP transport (not legacy SSE)

## Frontend Architecture

### State Management (Zustand)

| Store | Purpose |
|-------|---------|
| `editorStore` | Open files, active file, editor content, dirty state |
| `aiStore` | Chat messages, streaming state, MCP connection status |
| `settingsStore` | SAP connection settings, UI preferences |

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useABAPEditor` | Monaco editor setup, ABAP language config |
| `useAIAssistant` | AI chat operations, SSE streaming, MCP quick actions |
| `useAbaplint` | Client-side linting with abaplint rules |
| `useSAPConnection` | SAP system connection management |

### Services

| Service | Purpose |
|---------|---------|
| `api.ts` | REST client for abaper-gw (objects, activate, format, etc.) |
| `auth.ts` | Keycloak authentication, token management |
| `cai.ts` | SSE streaming client for AI chat via CAI gateway |
| `mcp.ts` | Direct MCP client for quick actions (review, analyze) |

## Authentication

- **Keycloak** multi-realm authentication (trm, individual, simplistek)
- Client ID: `abaper-editor` (public client)
- Token propagated as `Authorization: Bearer <token>` to all API calls
- SAP credentials stored in the editor's settings store and sent as `X-SAP-*` headers

## AI Chat Flow

1. User types a message in the AI panel
2. `useAIAssistant.sendPrompt()` calls `cai.streamChat()`
3. SSE connection opens to `/ai/chats/{chatId}` with `mcpServerName: 'abaper-mcp'`
4. cai-llm-router resolves the `abaper` agent (policy + active LLM profile)
5. LLM processes the request, calling MCP tools as needed (e.g., `create-and-activate`)
6. Structured SSE events stream back: `stream_tool_execution`, `stream_artifact`
7. Frontend renders tool execution log, artifact badges, and markdown response

## Agent Policy & Profiles

### Policy Resolver (agents.yaml)

The `abaper` agent config defines: model, max_iterations, timeout, MCP servers, tool filtering, system prompt, and retry behavior. Routing rules match incoming requests to agents by attributes (agent_name, has_mcp, model, prompt_length).

### LLM Profiles (NATS KV)

Profiles provide hot-reloadable overrides for the abaper agent without container restarts:

```
NATS KV bucket: "llm-profiles"
├── _active              → "abaper_default"     (which profile to use)
├── abaper_default       → YAML profile         (production prompt)
└── abaper_experimental  → YAML profile         (A/B testing)
```

Each profile can override: system_prompt, model, constraints (max_retries, repair_mode), and response_format. Per-environment overrides (dev/prd) are applied on load. `PROFILE_ENV` env var controls which overrides apply (default: `prd`).

On first run, the KV bucket is auto-created empty. The builtin default has no system prompt, so `agents.yaml` / `prompts/abaper.md` stays in effect until a profile is explicitly seeded.

## Structured SSE Events

During agent mode (multi-step tool execution), the backend emits structured events alongside the standard stream chunks:

| Event | Purpose | Frontend |
|-------|---------|----------|
| `stream_tool_execution` | Tool name, status, duration, result summary | Collapsible tool execution log |
| `stream_artifact` | Object name, type, action (created/activated/failed) | Color-coded artifact badges |
| `stream_progress` | Tools being executed, iteration number | Progress indicator |

These events are only emitted when `SuppressChunks=true` (agent mode), so non-MCP chat requests are unaffected.
