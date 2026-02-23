# ABAPer Editor

A web-based ABAP development environment with Monaco editor, AI-assisted coding, and direct SAP system integration.

## Overview

ABAPer Editor is a browser-based IDE for SAP ABAP development. It provides a VS Code-like editing experience powered by Monaco Editor, with built-in features for ABAP syntax highlighting, client-side linting via abaplint, and AI-powered code assistance through the Convo AI (CAI) platform.

**Live**: [abaper.bluefunda.com](https://abaper.bluefunda.com)

## Features

- **Monaco Editor** with ABAP syntax highlighting and IntelliSense
- **Client-side linting** via abaplint (runs entirely in the browser)
- **SAP system integration** — connect to SAP via ADT to read, create, save, and activate objects
- **AI Assistant** — chat with an LLM that has MCP tools for ABAP operations (code review, create objects, run tests, S/4HANA analysis)
- **Multi-system support** — connect to different SAP systems via per-request credentials
- **Package explorer** — browse SAP packages and objects in a tree view
- **Object activation** — activate ABAP objects directly from the editor
- **Syntax checking** — real-time syntax validation against the SAP system
- **Code formatting** — SAP pretty printer integration
- **Unit test runner** — execute ABAP unit tests from the editor
- **Transport management** — view and create transport requests
- **GitHub integration** — browse and import ABAP code from GitHub repositories

## Architecture

```
Browser (SPA)
  ├── Monaco Editor (ABAP syntax)
  ├── abaplint (client-side linting)
  ├── Keycloak auth (multi-realm)
  └── REST API calls
        │
        ├── /abaper/* → abaper-gw (KrakenD) → abaper-ts (ADT proxy)
        └── /ai/*     → ai-gw (KrakenD) → CAI platform → abaper-mcp
```

### Service Dependencies

| Service | Role |
|---------|------|
| [abaper-gw](https://github.com/bluefunda/abaper-gw) | API gateway (KrakenD) — JWT validation, routing |
| [abaper-ts](https://github.com/bluefunda/abaper-ts) | ADT proxy — translates REST calls to SAP ADT |
| [abaper-mcp](https://github.com/bluefunda/abaper-mcp) | MCP server — AI tool execution for ABAP operations |
| [ai-gw / CAI](https://github.com/bluefunda/cai-gw) | AI gateway — routes chat requests to LLM with MCP tools |

## Tech Stack

- **React 18** + TypeScript
- **Vite** — build tool
- **Monaco Editor** (`@monaco-editor/react`)
- **Tailwind CSS v4** — styling
- **Zustand** — state management
- **Keycloak JS** — authentication
- **abaplint** (`@abaplint/core`) — client-side ABAP linting
- **Playwright** — E2E testing
- **react-markdown** + **react-syntax-highlighter** — AI response rendering

## Development

### Prerequisites

- Node.js 20+
- npm

### Local Setup

```bash
# Install dependencies
npm install

# Start dev server (no auth mode)
NOAUTH=1 npm run dev
```

The dev server starts on `http://localhost:5173` with hot module replacement.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NOAUTH` | Disable Keycloak authentication | `false` |
| `VITE_KEYCLOAK_URL` | Keycloak server URL | `https://auth.bluefunda.com` |
| `VITE_KEYCLOAK_REALM` | Keycloak realm | `trm` |
| `VITE_KEYCLOAK_CLIENT_ID` | Keycloak client ID | `abaper-editor` |
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth client ID | — |

### Proxy Configuration

In development, Vite proxies API requests:

- `/abaper/*` → `http://localhost:8083` (abaper-gw) or `http://localhost:8087` (direct to abaper-ts)
- `/ai/*` → `http://localhost:8081` (ai-gw / CAI gateway)

### Build

```bash
npm run build    # TypeScript check + Vite build
```

Output goes to `dist/` for static hosting.

### Testing

```bash
npx playwright test         # Run E2E tests
npx playwright test --ui    # Interactive test runner
```

## Deployment

Docker image: `bdadevops/abaper-editor:latest`

The Docker build uses a multi-stage approach:
1. Node.js build stage — `npm ci && npm run build`
2. Nginx stage — serves the static SPA with proper routing

CI/CD via GitHub Actions builds and pushes to Docker Hub on merge to `main`. Watchtower on the frontend node auto-pulls new images.

## Project Structure

```
src/
├── components/
│   ├── common/          # Shared UI components
│   ├── layout/          # MenuBar, Sidebar, StatusBar
│   └── panels/          # AIPanel, ExplorerPanel, ProblemsPanel
├── hooks/               # React hooks (useABAPEditor, useAIAssistant, useAbaplint, useSAPConnection)
├── services/            # API clients (api.ts, auth.ts, cai.ts, mcp.ts)
├── stores/              # Zustand stores (editorStore, aiStore, settingsStore)
├── types/               # TypeScript type definitions
├── App.tsx              # Main application component
└── main.tsx             # Entry point
```

## License

Private — BlueFunda BV
