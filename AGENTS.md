# AGENTS.md — ABAPer Editor

## Project Identity

Browser-based ABAP IDE. React 18 SPA with Monaco Editor, Zustand state management, Tailwind CSS v4, Vite build tooling. TypeScript strict mode throughout.

## Build & Verify Commands

```bash
# Install
npm ci

# Type-check (must pass before any PR)
npx tsc --noEmit

# Build (produces dist/)
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# E2E tests (Playwright, Chromium only)
npx playwright install --with-deps chromium   # first time
npx playwright test                            # headless
npx playwright test --ui                       # interactive

# Dev server (no auth, no backend needed)
NOAUTH=1 npm run dev

# Dev server with local backend stack
make up && make dev
```

After every change, run `npx tsc --noEmit` to confirm type safety. The CI pipeline runs typecheck + build + Playwright E2E on every PR.

## Architecture

```
src/main.tsx          Entry point. Initializes Keycloak auth, mounts <App />.
src/App.tsx           Root component. Wires all panels, dialogs, keyboard shortcuts.
                      ~460 lines. Monolithic — do not split without explicit request.

src/components/
  layout/             MenuBar, Sidebar, TabBar, BottomPanel, RightPanel, StatusBar
  panels/             AIPanel, ExplorerPanel, SearchPanel, GitPanel, GitHubExplorerPanel,
                      ProblemsPanel, OutputPanel, TranspilerPanel
  editor/             ABAPEditor (Monaco wrapper)
  dialogs/            OpenObjectDialog, ConnectionDialog, NewObjectDialog, AddSystemDialog
  common/             Shared UI primitives (Spinner, etc.)

src/hooks/            React hooks — each owns one concern:
  useABAPEditor.ts    Monaco setup + keybindings
  useAbaplint.ts      Debounced in-browser ABAP linting (Web Worker)
  useAIAssistant.ts   AI chat actions (review, explain, S/4 analysis, streaming)
  useGit.ts           Git operations
  useGitHubExplorer.ts GitHub repo browsing
  useResizable.ts     Drag-to-resize panels
  useSAPConnection.ts  SAP health polling
  useTranspiler.ts    ABAP-to-JS transpilation (Web Worker)

src/services/         API clients — pure functions, no React dependencies:
  api.ts              SAP/ADT REST client (fetchJSON wrapper with auth headers)
  auth.ts             Keycloak init, token management, realm extraction from URL path
  cai.ts              AI chat streaming (SSE/NDJSON)
  mcp.ts              MCP agent protocol client (Streamable HTTP)
  github-auth.ts      GitHub OAuth token exchange
  connection.ts       Connection state helpers
  abaplint.ts         Web Worker message bridge for @abaplint/core
  transpiler.ts       Web Worker message bridge for @abaplint/transpiler

src/stores/           Zustand stores — single source of truth for each domain:
  editorStore.ts      Tabs, active tab, Monaco models, diagnostics, output log
  aiStore.ts          AI messages, streaming state, MCP tools, model selection
  settingsStore.ts    Theme, panel visibility, panel sizes (persisted to localStorage)
  connectionStore.ts  SAP connection config, activateOnSave flag
  systemStore.ts      Multi-system SAP credentials
  gitStore.ts         Git state
  githubExplorerStore.ts  GitHub repo/branch/path navigation state
  favoritePackagesStore.ts  Pinned SAP packages

src/types/            TypeScript interfaces (no runtime code):
  adt.ts              ADTSourceCode, ADTObject, SyntaxCheckResult, ActivationResult, etc.
  editor.ts           TabState, DiagnosticItem, ABAPObjectType, TranspilerOutput
  mcp.ts              AIMessage, ReviewFinding, S4RemediationResult, MCPToolInfo
  git.ts              Git types
  lsp.ts              LSP types

src/workers/          Web Workers (run off main thread):
  abaplint.worker.ts  Parses ABAP via @abaplint/core, returns diagnostics
  transpiler.worker.ts Transpiles ABAP to JS via @abaplint/transpiler

src/languages/abap/   Monaco ABAP language registration (Monarch tokenizer, config, theme, snippets, completions)
```

## Code Patterns — Follow These Exactly

### Zustand stores
```typescript
// Always: create<StateInterface>() with (set, get) =>
// Access outside React: useStore.getState().action()
// Access in React: useStore((s) => s.field)
// Persist pattern: wrap with persist() middleware, bump version on schema change
export const useMyStore = create<MyState>((set, get) => ({
  field: initialValue,
  action: (arg) => set((s) => ({ field: transform(s.field, arg) })),
}));
```

### API calls (services/api.ts)
```typescript
// All SAP API calls go through fetchJSON<T>(path, options)
// fetchJSON handles: auth token injection, realm header, SAP system headers, error unwrapping
// Response shape: { success: boolean, data: T, error?: string }
// Always use POST for SAP operations (even reads — GET /api/v1/objects/get is POST)
export async function myEndpoint(args): Promise<ReturnType> {
  const res = await fetchJSON<APIResponse<ReturnType>>('/api/v1/endpoint', {
    method: 'POST',
    body: JSON.stringify(args),
  });
  return res.data;
}
```

### React components
- Functional components only, no class components (except ErrorBoundary in main.tsx)
- Props passed down from App.tsx via callbacks — App.tsx is the orchestrator
- Use `useCallback` for handlers passed as props
- Tailwind CSS v4 classes for all styling — no CSS modules, no styled-components
- Dark theme is default. CSS custom properties defined in `src/index.css` for editor colors
- Path alias: `@/` maps to `src/` (configured in tsconfig.json and vite.config.ts)

### Web Workers
- Communication via `postMessage` / `onmessage`
- Workers are in `src/workers/`, service wrappers in `src/services/`
- Used for CPU-heavy operations (abaplint parsing, transpilation) to keep UI responsive

### Auth
- Keycloak with multi-realm via URL path (`/trm`, `/individual`, `/simplistek`)
- `VITE_SKIP_AUTH=true` disables Keycloak entirely (used in E2E tests and local dev)
- Token injected into all API calls via `Authorization: Bearer` header
- Realm sent via `X-Realm` header
- SAP credentials sent via `X-SAP-Host`, `X-SAP-Client`, `X-SAP-User`, `X-SAP-Password` headers

## Type System Constraints

tsconfig.json enforces:
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noUncheckedIndexedAccess: true` — all indexed access returns `T | undefined`
- `noFallthroughCasesInSwitch: true`

Never use `any` unless suppressed with `// eslint-disable-next-line @typescript-eslint/no-explicit-any`. Prefer `unknown` and narrow.

## ABAPObjectType — Canonical Values

The frontend uses these exact string literals for object types:

```typescript
type ABAPObjectType = 'program' | 'class' | 'interface' | 'function' | 'table' | 'structure';
```

ADT types from the backend (e.g., `CLAS/OC`, `PROG/P`) are normalized via `normalizeObjectType()` in `editorStore.ts`.

## File Naming Conventions

ABAP objects use abapGit-style extensions for Monaco model URIs:
- `.prog.abap` (program), `.clas.abap` (class), `.intf.abap` (interface)
- `.fugr.abap` (function group), `.tabl.abap` (table), `.stru.abap` (structure)

## Safe Modification Boundaries

### Safe to modify (low risk, isolated):
- Individual panel components in `src/components/panels/`
- Individual hooks in `src/hooks/`
- Type definitions in `src/types/`
- Language definitions in `src/languages/abap/`
- E2E tests in `e2e/`
- CSS in `src/index.css`

### Modify with care (shared state, many dependents):
- `src/stores/*` — stores are imported across the entire app
- `src/services/api.ts` — all SAP API calls flow through `fetchJSON`
- `src/services/auth.ts` — auth affects every API call
- `src/App.tsx` — orchestrates all panels, shortcuts, and handlers
- `src/components/layout/*` — structural layout components

### Do not modify without explicit request:
- `vite.config.ts` — proxy configuration affects dev/prod routing
- `Dockerfile` / `docker-compose*.yml` — deployment infrastructure
- `.github/workflows/*` — CI/CD pipelines
- `playwright.config.ts` — test infrastructure
- `package.json` dependencies — adding deps changes bundle size significantly (Monaco is already huge)

## Keyboard Shortcuts (Reference)

These are registered in `App.tsx` via `window.addEventListener('keydown', ...)`:

| Shortcut | Action | Handler |
|----------|--------|---------|
| Cmd+P | Open object dialog | `setOpenObjectDialogOpen(true)` |
| Cmd+S | Save to SAP | `handleSave` |
| Cmd+Shift+A | Activate object | `handleActivate` |
| Cmd+Shift+B | Syntax check | `handleSyntaxCheck` |
| Cmd+B | Toggle sidebar | `toggleSidebar` |
| Cmd+J | Toggle bottom panel | `toggleBottomPanel` |
| Cmd+L | Toggle AI right panel | `toggleRightPanel` |
| Cmd+N | New object dialog | `setNewObjectDialogOpen(true)` |
| Shift+Alt+F | Format code | `handleFormatCode` |
| Cmd+Shift+R | AI code review | `handleAIReview` |
| Cmd+Shift+4 | AI S/4 analysis | `handleAIS4Check` |

## Proxy Routing (Dev Server)

Three modes controlled by environment variables:

| Mode | Command | Behavior |
|------|---------|----------|
| Production proxy | `npm run dev` | All requests to `abaper.bluefunda.com` |
| Local stack | `LOCAL=1 npm run dev` | `/api/*` through KrakenD (8083), `/ai/*` through BFF (8084) |
| No auth | `NOAUTH=1 npm run dev` | `/api/*` direct to abaper-ts (8085), auth disabled |

## E2E Testing

- Framework: Playwright (Chromium only)
- Test dir: `e2e/`
- Dev server launched automatically with `VITE_SKIP_AUTH=true NOAUTH=1`
- Base URL: `http://localhost:5173`
- Tests: `ai-panel.spec.ts`, `editor.spec.ts`, `explorer.spec.ts`, `keyboard.spec.ts`, `search.spec.ts`, `sidebar.spec.ts`
- CI retries: 2, workers: 1, reporter: html
- Local: no retries, parallel workers, reporter: list

## Docker & Deployment

- Image: `bdadevops/abaper-editor:latest` (private, Docker Hub)
- Multi-stage build: Node 20 Alpine (build) + Nginx Alpine (serve)
- Build requires `NODE_OPTIONS="--max-old-space-size=4096"` (Monaco is large)
- Build arg: `VITE_GITHUB_CLIENT_ID` injected at build time
- Nginx serves SPA from `/usr/share/nginx/html`, uses `nginx.conf.template` with envsubst
- Watchtower auto-deploys on the frontend node after push to main

## CI/CD Pipeline

1. **PR**: `ci.yml` runs typecheck + build + Playwright E2E
2. **Merge to main**: `deploy.yml` runs typecheck + build, then Docker build + push to `bdadevops/abaper-editor:latest`
3. **Release**: `release.yml` runs release-please for changelog and versioning

## Common Pitfalls

- **Monaco model lifecycle**: Always dispose models when closing tabs (`tab.model.dispose()`). Check for stale models with the same URI before creating new ones.
- **Bundle size**: Monaco, abaplint, and the transpiler are split into separate chunks via `manualChunks` in vite.config.ts. Adding large dependencies requires justification.
- **fetchJSON unwraps `{ success, data }`**: API functions return `res.data`, not the raw response. Check `types/adt.ts` for the exact response shapes.
- **Store access outside React**: Use `useStore.getState()` — this is used extensively in `App.tsx` callbacks.
- **Auth in tests**: E2E tests run with `VITE_SKIP_AUTH=true` — the auth module short-circuits and returns `true`.
- **ABAP is case-insensitive**: All Monarch grammar rules, search, and completion must handle case insensitivity.
