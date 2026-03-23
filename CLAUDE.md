# CLAUDE.md — abaper-editor

## What is this?

Browser-based ABAP IDE. React 18 SPA with Monaco Editor, Zustand state, Tailwind CSS v4, Vite.

## Build & Verify

```bash
npm ci
npx tsc --noEmit                                          # Type check — must pass
NODE_OPTIONS="--max-old-space-size=4096" npm run build     # Production build
npx playwright test                                        # E2E tests
NOAUTH=1 npm run dev                                       # Dev server (no auth)
```

Always run `npx tsc --noEmit` after changes.

## Key Rules

- TypeScript strict mode: `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`
- Never use `any` — prefer `unknown` and narrow
- Path alias: `@/` maps to `src/`
- ESM imports, functional components only, Tailwind for all styling
- Zustand stores are single source of truth per domain
- All SAP API calls go through `fetchJSON<T>()` in `services/api.ts`
- Keycloak multi-realm auth; `VITE_SKIP_AUTH=true` disables auth
- Web Workers for CPU-heavy ops (abaplint, transpiler)
- Monaco model lifecycle: always dispose on tab close

## Architecture

- `src/App.tsx` — monolithic orchestrator (~460 lines), do not split without request
- `src/stores/` — Zustand stores (editor, ai, settings, connection, system, git, etc.)
- `src/services/` — API clients (api.ts, auth.ts, cai.ts, mcp.ts)
- `src/hooks/` — React hooks, one concern each
- `src/components/` — layout, panels, editor, dialogs, common
- `src/types/` — TypeScript interfaces (no runtime code)

## Conventions

- Commits: conventional format with optional scope
- Branches: `<type>/<short-description>`
- PRs: conventional commit title, target `main`, squash-merged
