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
     /abaper/* REST              /ai/* SSE
              │                       │
              ▼                       ▼
    ┌──────────────┐        ┌──────────────┐
    │  abaper-gw   │        │    ai-gw     │
    │ KrakenD:8083 │        │ KrakenD:8081 │
    │  JWT + CORS  │        │  JWT + CORS  │
    └──────┬───────┘        └──────┬───────┘
           │                       │
    ┌──────┴───────┐        ┌──────┴───────┐
    │  abaper-ts   │        │   cai-bff    │
    │ Express:8087 │        │   (Go/NATS)  │
    │  ADT proxy   │        └──────┬───────┘
    └──────┬───────┘               │
           │                ┌──────┴────────┐
           ▼                │ cai-llm-router│
    ┌──────────────┐        │  (Temporal)   │
    │  SAP System  │        └──────┬────────┘
    │   (ADT API)  │               │
    └──────────────┘        ┌──────┴────────┐
                            │  abaper-mcp   │
                            │  (MCP tools)  │
                            └──────┬────────┘
                                   │
                            ┌──────┴────────┐
                            │  abaper-ts    │
                            │  (ADT proxy)  │
                            └──────┬────────┘
                                   │
                            ┌──────┴────────┐
                            │  SAP System   │
                            └───────────────┘
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

### 2. AI-Assisted Operations (SSE Streaming)

Chat messages in the AI panel go through the CAI (Convo AI) path:

```
Editor → ai-gw → cai-bff → cai-llm-router → LLM + abaper-mcp → abaper-ts → SAP
```

- **ai-gw** validates JWT, routes to CAI backend
- **cai-bff** bridges HTTP to NATS messaging
- **cai-llm-router** orchestrates LLM calls with MCP tool execution
- **abaper-mcp** exposes ABAP operations as MCP tools the LLM can invoke
- Responses stream back as Server-Sent Events (SSE)

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
4. cai-llm-router routes to the `abaper` agent (model + MCP tools)
5. LLM processes the request, calling MCP tools as needed (e.g., `create-class`, `activate-object`)
6. Streaming chunks render progressively with markdown formatting
7. Code blocks get syntax highlighting via react-syntax-highlighter
