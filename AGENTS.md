# Claude Code Prompt: ABAPer Monaco Editor

## Project Overview

Build **ABAPer Editor** — a browser-based ABAP code editor powered by Monaco Editor with deep SAP ADT integration. This is the web frontend for BlueFunda's `abaper` CLI/REST backend (`github.com/bluefunda/abaper`). The editor should feel like a purpose-built IDE for ABAP developers, not a generic text editor.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Editor | Monaco Editor (latest, via `monaco-editor` npm package) |
| Frontend | React 18+ with TypeScript, Vite for build tooling |
| Styling | Tailwind CSS 4 |
| LSP Client | `monaco-languageclient` + `vscode-ws-jsonrpc` for WebSocket LSP transport |
| Linting | [abaplint](https://github.com/abaplint/abaplint) — runs in-browser via the npm package `@abaplint/core` for offline linting, and/or connects to the abaper Go LSP backend for live SAP diagnostics |
| Transpiler | [abaplint/transpiler](https://github.com/abaplint/transpiler) — `@abaplint/transpiler` npm package for ABAP-to-JS transpilation, enabling in-browser ABAP execution/preview |
| Backend API | ABAPer Go REST server (`abaper --server`, default port 8080) |
| LSP Backend | ABAPer Go LSP server (`abaper lsp`, stdio or TCP mode) |
| Desktop (future) | Tauri v2 shell (plan for it, don't implement yet) |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser                                              │
│  ┌────────────────────────────────────────────────┐  │
│  │  React App (Vite + TypeScript)                  │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  Monaco Editor                            │  │  │
│  │  │  + ABAP Monarch Language (syntax)         │  │  │
│  │  │  + abaplint in-browser (offline lint)      │  │  │
│  │  │  + abaplint/transpiler (ABAP→JS preview)  │  │  │
│  │  │  + Monaco Language Client (LSP bridge)     │  │  │
│  │  └─────────────┬────────────────────────────┘  │  │
│  │                │                                │  │
│  │  ┌─────────────┴────────────────────────────┐  │  │
│  │  │  Panels: Explorer │ Transport │ AI │ Term │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────┬───────────────────────────────┘  │
└───────────────────┼──────────────────────────────────┘
                    │ REST API + WebSocket (LSP)
┌───────────────────┼──────────────────────────────────┐
│  ABAPer Go Backend │                                  │
│  ├── REST: /api/v1/objects/{get,create,search,list}  │
│  ├── REST: /api/v1/activate                          │
│  ├── REST: /api/v1/syntax-check                      │
│  ├── REST: /api/v1/transports                        │
│  ├── WebSocket: /lsp (proxied LSP JSON-RPC)          │
│  └── Hybrid Backend (ADT live + offline fallback)    │
│       ├── ADT Backend (SAP system connected)         │
│       └── Offline Backend (abaplint CLI)             │
└───────────────────┬──────────────────────────────────┘
                    │ ADT REST / RFC
               ┌────┴─────┐
               │ SAP System│
               └──────────┘
```

## Existing ABAPer Backend Context

The `abaper` Go binary already provides everything the editor needs:

### REST API (when run with `abaper --server -p 8080`)
- `GET /api/v1/objects/get?type={program|class|function|interface|table|structure}&name={NAME}&functionGroup={FG}` — retrieve ABAP source
- `POST /api/v1/objects/create` — create new ABAP objects
- `GET /api/v1/objects/search?pattern={PATTERN}&types={csv}` — search SAP repository
- `GET /api/v1/objects/list?type=packages&pattern={PATTERN}` — list packages
- `POST /api/v1/activate` — activate ABAP objects
- `POST /api/v1/syntax-check` — run syntax check
- `GET /health` — health check
- `GET /version` — version info

### LSP Server (when run with `abaper lsp`)
- Supports stdio and TCP transports
- Provides: completion, hover, go-to-definition, formatting, diagnostics
- Uses `HybridBackend`: tries live SAP ADT first, falls back to offline (abaplint + keyword completion)
- Document sync: open/change/save/close
- Activate-on-save support

### ADTClient Interface (types the frontend should understand)
```typescript
// Mirror these from the Go types package
interface ADTSourceCode {
  object_name: string;
  object_type: string;
  source: string;
  version: string;
  etag: string;
}

interface ADTObject {
  name: string;
  type: string;
  description: string;
  package: string;
  responsible: string;
  created_by: string;
  changed_by: string;
}

interface SyntaxCheckResult {
  object_name: string;
  object_type: string;
  messages: SyntaxCheckMessage[];
}

interface SyntaxCheckMessage {
  severity: "error" | "warning" | "info" | "hint";
  text: string;
  line: number;
  column: number;
  end_line: number;
  end_col: number;
  code?: string;
}

interface CompletionProposal {
  identifier: string;
  description: string;
  kind: "keyword" | "function" | "variable" | "class" | "type";
  insert_text?: string;
}

interface ActivationResult {
  object_name: string;
  object_type: string;
  success: boolean;
  messages?: { severity: string; text: string; line?: number }[];
}
```

## Phase 1: Core Editor (Build This First)

### 1.1 — Project Scaffolding

```bash
# Initialize project
npm create vite@latest abaper-editor -- --template react-ts
cd abaper-editor

# Core dependencies
npm install monaco-editor @monaco-editor/react
npm install @abaplint/core                        # In-browser ABAP linting
npm install @anthropic-ai/sdk                     # For future AI panel (optional)

# LSP client (for connecting to abaper LSP backend)
npm install monaco-languageclient vscode-ws-jsonrpc vscode-languageclient

# abaplint transpiler for in-browser ABAP execution
npm install @abaplint/transpiler

# UI
npm install @tailwindcss/vite tailwindcss lucide-react

# Dev
npm install -D @types/node vite-plugin-monaco-editor
```

### 1.2 — ABAP Monarch Language Definition

Create a comprehensive Monarch tokenizer for ABAP. This provides syntax highlighting without needing Tree-sitter. The grammar must handle:

**Keywords** (case-insensitive — ABAP is case-insensitive):
- Declarations: `DATA`, `TYPES`, `CONSTANTS`, `FIELD-SYMBOLS`, `CLASS-DATA`, `STATICS`, `PARAMETERS`, `SELECT-OPTIONS`, `TABLES`
- Control flow: `IF`, `ELSE`, `ELSEIF`, `ENDIF`, `CASE`, `WHEN`, `ENDCASE`, `DO`, `ENDDO`, `WHILE`, `ENDWHILE`, `LOOP`, `ENDLOOP`, `EXIT`, `CHECK`, `CONTINUE`, `RETURN`
- OOP: `CLASS`, `ENDCLASS`, `METHOD`, `ENDMETHOD`, `INTERFACE`, `ENDINTERFACE`, `INHERITING FROM`, `IMPLEMENTING`, `PUBLIC`, `PROTECTED`, `PRIVATE`, `SECTION`, `CREATE PUBLIC`, `CREATE PRIVATE`, `CREATE PROTECTED`, `ABSTRACT`, `FINAL`, `REDEFINITION`
- Database: `SELECT`, `ENDSELECT`, `INSERT`, `UPDATE`, `DELETE`, `MODIFY`, `INTO`, `FROM`, `WHERE`, `ORDER BY`, `GROUP BY`, `HAVING`, `UP TO`, `ROWS`, `APPENDING TABLE`, `INTO TABLE`, `FOR ALL ENTRIES IN`, `INNER JOIN`, `LEFT OUTER JOIN`
- Internal tables: `APPEND`, `COLLECT`, `INSERT`, `MODIFY`, `DELETE`, `READ TABLE`, `SORT`, `CLEAR`, `REFRESH`, `FREE`, `DESCRIBE TABLE`, `LINES`, `TRANSPORTING`, `WITH KEY`, `BINARY SEARCH`, `INDEX`
- Strings: `CONCATENATE`, `SPLIT`, `CONDENSE`, `TRANSLATE`, `REPLACE`, `FIND`, `MATCH`, `STRLEN`, `SUBSTRING`
- Events: `START-OF-SELECTION`, `END-OF-SELECTION`, `AT SELECTION-SCREEN`, `INITIALIZATION`, `TOP-OF-PAGE`, `END-OF-PAGE`
- Macros/includes: `DEFINE`, `END-OF-DEFINITION`, `INCLUDE`
- Exception handling: `TRY`, `CATCH`, `CLEANUP`, `ENDTRY`, `RAISE`, `RAISING`
- Type qualifiers: `TYPE`, `TYPE REF TO`, `LIKE`, `TYPE TABLE OF`, `TYPE STANDARD TABLE OF`, `TYPE SORTED TABLE OF`, `TYPE HASHED TABLE OF`, `TYPE RANGE OF`, `TYPE LINE OF`
- Built-in types: `i`, `f`, `c`, `n`, `d`, `t`, `x`, `p`, `string`, `xstring`, `decfloat16`, `decfloat34`, `int8`, `abap_bool`, `abap_true`, `abap_false`

**Comments**:
- Line comments starting with `*` in column 1
- Inline comments starting with `"` anywhere in the line

**Strings**:
- Single-quoted: `'hello world'`
- String templates (backtick): `` |Hello { lv_name }, today is { sy-datum }| ``
- Escaped pipes in string templates

**Operators**: `=`, `<>`, `<`, `>`, `<=`, `>=`, `EQ`, `NE`, `LT`, `GT`, `LE`, `GE`, `AND`, `OR`, `NOT`, `IS INITIAL`, `IS NOT INITIAL`, `IS BOUND`, `IS ASSIGNED`, `BETWEEN`, `IN`, `CO`, `CN`, `CA`, `NA`, `CS`, `NS`, `CP`, `NP`

**System variables**: `sy-subrc`, `sy-tabix`, `sy-index`, `sy-datum`, `sy-uzeit`, `sy-uname`, `sy-mandt`, `sy-langu`, `sy-tcode`, `sy-repid`, `sy-dbcnt`, `sy-msgty`, `sy-msgno`, `sy-msgv1`–`sy-msgv4`

**Pragmas**: `##NO_TEXT`, `##NEEDED`, `##SHADOW` etc.

**Pseudo-comments**: `"#EC` prefixed comments

### 1.3 — abaplint In-Browser Integration

Use `@abaplint/core` to run ABAP linting directly in the browser without needing the Go backend:

```typescript
import { Registry, MemoryFile, Config } from "@abaplint/core";

// Load the default abaplint config (can be customized)
const config = new Config(JSON.stringify(defaultAbaplintConfig));

// Create a registry with the source file
const reg = new Registry(config);
reg.addFile(new MemoryFile("zprogram.prog.abap", sourceCode));
await reg.parseAsync();

// Get diagnostics
const issues = reg.findIssues();
// Convert to Monaco markers
const markers = issues.map(issue => ({
  severity: mapSeverity(issue.getSeverity()),
  message: issue.getMessage(),
  startLineNumber: issue.getStart().getRow(),
  startColumn: issue.getStart().getCol(),
  endLineNumber: issue.getEnd().getRow(),
  endColumn: issue.getEnd().getCol(),
  source: "abaplint",
  code: issue.getKey(),
}));
monaco.editor.setModelMarkers(model, "abaplint", markers);
```

This provides immediate feedback even when disconnected from SAP. Debounce lint runs (300ms after last keystroke).

### 1.4 — abaplint Transpiler Integration

Use `@abaplint/transpiler` to transpile ABAP to JavaScript and run it in-browser. This enables an "ABAP Playground" / preview mode:

```typescript
import { Transpiler } from "@abaplint/transpiler";

// Transpile ABAP source to JavaScript
const transpiler = new Transpiler();
const result = await transpiler.run([
  { filename: "zprogram.prog.abap", contents: sourceCode }
]);

// result.objects contains transpiled JS
// Execute in a sandboxed iframe or web worker for preview
```

Use cases:
- **ABAP Playground**: Write ABAP, see JS output, execute and see WRITE output
- **Unit test preview**: Run simple ABAP logic locally before pushing to SAP
- **Learning mode**: Let developers experiment with ABAP syntax without a SAP system

The transpiler panel should show:
1. The transpiled JavaScript source (read-only Monaco instance with JS language)
2. A "Run" button that executes the transpiled code in a sandboxed web worker
3. Console output panel showing WRITE statements and sy-subrc values

### 1.5 — Editor Layout

Build a VS Code-like layout:

```
┌─────────────────────────────────────────────────────────┐
│  Menu Bar: File │ Edit │ View │ SAP │ Help               │
├────────┬────────────────────────────────────────────────┤
│        │  Tab Bar: [ZPROGRAM.prog.abap ×] [ZCL_TEST ×] │
│  Side  │────────────────────────────────────────────────│
│  bar   │                                                │
│        │  Monaco Editor                                 │
│ [📁]   │  (ABAP source with syntax highlighting,        │
│ [🔍]   │   diagnostics, completions)                    │
│ [📦]   │                                                │
│ [🚀]   │                                                │
│ [🤖]   │                                                │
│        │────────────────────────────────────────────────│
│        │  Bottom Panel: Problems │ Output │ Transpiler  │
│        │  [⚠ 2 warnings] [✗ 1 error]                   │
└────────┴────────────────────────────────────────────────┘
```

**Sidebar panels** (icon-based, collapsible):
1. **Explorer** (📁): Object tree — browse packages, programs, classes. Calls `GET /api/v1/objects/list` and `GET /api/v1/objects/search`
2. **Search** (🔍): Search SAP repository by pattern. Calls `GET /api/v1/objects/search`
3. **Transport** (📦): View transport requests (future)
4. **S/4 Remediation** (🚀): Show S/4HANA compatibility issues for current object
5. **AI Assistant** (🤖): Chat panel for BlueFunda AI code assistance (future)

**Bottom panels**:
1. **Problems**: Shows diagnostics from abaplint (in-browser) + LSP backend
2. **Output**: Server logs, activation results
3. **Transpiler**: Shows transpiled JS output from `@abaplint/transpiler`, with Run button

### 1.6 — SAP Connection Configuration

Settings dialog/panel to configure the ABAPer backend connection:

```typescript
interface ConnectionConfig {
  backendUrl: string;      // e.g., "http://localhost:8080"
  sapHost: string;         // SAP system host
  sapClient: string;       // SAP client number
  sapUsername: string;      // SAP username
  sapPassword: string;     // SAP password (stored in sessionStorage only)
  lspMode: "websocket" | "disabled";
  lspUrl: string;          // e.g., "ws://localhost:8089"
  offlineLinting: boolean; // Use @abaplint/core in-browser
  activateOnSave: boolean;
}
```

Connection status indicator in the status bar: 🟢 Connected / 🟡 Offline / 🔴 Error

### 1.7 — Key Editor Features

**Must-have from Day 1**:
- Open object from SAP: Cmd+P → search by name → fetch source via REST API
- Save back to SAP: Cmd+S → `POST /api/v1/objects/create` (updates source)
- Syntax check: Cmd+Shift+B → `POST /api/v1/syntax-check` → show in Problems panel
- Activate: Cmd+Shift+A → `POST /api/v1/activate` → show result in Output
- In-browser linting: Real-time abaplint diagnostics as you type (no backend needed)
- Transpile preview: Cmd+Shift+T → transpile current ABAP to JS, show in bottom panel
- Multiple tabs: Open multiple ABAP objects simultaneously
- Dirty indicator: Show unsaved changes in tab title

**Keyboard shortcuts** (match SE80/Eclipse ADT where possible):
| Action | Shortcut |
|--------|----------|
| Open object | Cmd+P / Ctrl+P |
| Save to SAP | Cmd+S / Ctrl+S |
| Activate | Cmd+Shift+A / Ctrl+Shift+A |
| Syntax check | Cmd+Shift+B / Ctrl+Shift+B |
| Transpile | Cmd+Shift+T / Ctrl+Shift+T |
| Find | Cmd+F / Ctrl+F |
| Go to line | Cmd+G / Ctrl+G |
| Command palette | Cmd+Shift+P / Ctrl+Shift+P |
| Toggle sidebar | Cmd+B / Ctrl+B |
| Toggle bottom panel | Cmd+J / Ctrl+J |

### 1.8 — Status Bar

Bottom status bar showing:
- SAP connection status (🟢/🟡/🔴 + system name)
- Current object type and name
- Cursor position (Ln X, Col Y)
- abaplint issues count
- SAP client/user info
- Encoding (UTF-8)

## Phase 2: Enhanced Features (Build After Phase 1)

### 2.1 — LSP Integration via WebSocket
Wire Monaco to the abaper LSP server over WebSocket for live SAP-backed intelligence:
- Completions from SAP data dictionary
- Hover info with type details
- Go-to-definition across objects
- Format on save (ABAP Pretty Printer)

### 2.2 — Object Explorer Tree
Full package/object tree with lazy loading. Double-click opens in editor tab.

### 2.3 — Transport Management
View, create, and release transport requests from the editor.

### 2.4 — S/4HANA Remediation Panel
Show compatibility warnings for current object (leveraging abaper-mcp's remediation patterns).

### 2.5 — Diff Editor
Compare local changes with SAP version side-by-side using Monaco's built-in diff editor.

### 2.6 — AI Assistant Panel
Embedded chat panel connecting to BlueFunda AI for:
- Code explanation
- Code generation
- Modernization suggestions
- Bug analysis

## File Structure

```
abaper-editor/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx                          # Entry point
│   ├── App.tsx                           # Root layout
│   ├── index.css                         # Tailwind imports
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx               # Icon sidebar + panel container
│   │   │   ├── TabBar.tsx                # Editor tabs
│   │   │   ├── StatusBar.tsx             # Bottom status bar
│   │   │   ├── BottomPanel.tsx           # Problems/Output/Transpiler tabs
│   │   │   └── MenuBar.tsx               # Top menu
│   │   │
│   │   ├── editor/
│   │   │   ├── ABAPEditor.tsx            # Main Monaco wrapper
│   │   │   ├── EditorTabs.tsx            # Tab management
│   │   │   └── DiffEditor.tsx            # Side-by-side diff (Phase 2)
│   │   │
│   │   ├── panels/
│   │   │   ├── ExplorerPanel.tsx         # Object tree browser
│   │   │   ├── SearchPanel.tsx           # Repository search
│   │   │   ├── TransportPanel.tsx        # Transport requests (Phase 2)
│   │   │   ├── RemediationPanel.tsx      # S/4 compatibility (Phase 2)
│   │   │   ├── AIPanel.tsx              # AI assistant (Phase 2)
│   │   │   ├── ProblemsPanel.tsx         # Diagnostics list
│   │   │   ├── OutputPanel.tsx           # Logs and activation results
│   │   │   └── TranspilerPanel.tsx       # Transpiled JS + Run button
│   │   │
│   │   ├── dialogs/
│   │   │   ├── OpenObjectDialog.tsx      # Cmd+P quick-open
│   │   │   ├── ConnectionDialog.tsx      # SAP connection settings
│   │   │   └── NewObjectDialog.tsx       # Create new ABAP object
│   │   │
│   │   └── common/
│   │       ├── Icon.tsx                  # Lucide icon wrapper
│   │       └── Spinner.tsx               # Loading indicator
│   │
│   ├── languages/
│   │   └── abap/
│   │       ├── monarch.ts               # Monarch tokenizer definition
│   │       ├── configuration.ts          # Language config (brackets, comments, etc.)
│   │       ├── completions.ts            # Static completion providers (keywords, snippets)
│   │       ├── theme.ts                  # ABAP-optimized editor themes (light + dark)
│   │       └── snippets.ts              # Code snippets (class template, method, SELECT, etc.)
│   │
│   ├── services/
│   │   ├── api.ts                        # ABAPer REST API client
│   │   ├── lsp.ts                        # WebSocket LSP client setup
│   │   ├── abaplint.ts                   # In-browser @abaplint/core wrapper
│   │   ├── transpiler.ts                 # @abaplint/transpiler wrapper
│   │   └── connection.ts                 # Connection state management
│   │
│   ├── stores/
│   │   ├── editorStore.ts               # Open tabs, active file, dirty state
│   │   ├── connectionStore.ts           # SAP connection config/status
│   │   └── settingsStore.ts             # User preferences
│   │
│   ├── hooks/
│   │   ├── useABAPEditor.ts             # Editor setup + keybindings
│   │   ├── useAbaplint.ts               # Debounced in-browser linting
│   │   ├── useTranspiler.ts             # ABAP→JS transpilation
│   │   └── useSAPConnection.ts          # Connection health monitoring
│   │
│   └── types/
│       ├── adt.ts                        # ADT response types (mirror Go types)
│       ├── editor.ts                     # Editor state types
│       └── lsp.ts                        # LSP message types
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── Dockerfile                            # Multi-stage: build + nginx
├── docker-compose.yml                    # Editor + abaper backend
└── README.md
```

## Docker Deployment

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
```

```yaml
# docker-compose.yml
services:
  editor:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - abaper

  abaper:
    image: bluefunda/abaper:latest
    command: abaper --server -p 8080
    ports:
      - "8080:8080"
    environment:
      - SAP_HOST=${SAP_HOST}
      - SAP_CLIENT=${SAP_CLIENT}
      - SAP_USERNAME=${SAP_USERNAME}
      - SAP_PASSWORD=${SAP_PASSWORD}
```

nginx.conf should proxy `/api` to the abaper backend and `/lsp` WebSocket to the LSP server.

## Key Libraries Reference

### abaplint (`@abaplint/core`)
- GitHub: https://github.com/abaplint/abaplint
- Purpose: ABAP parser, linter, and static analysis — runs entirely in the browser
- Key classes: `Registry`, `MemoryFile`, `Config`, `Issue`
- The default config JSON from the abaper project should be used (comprehensive rule set already exists at `internal/lsp/abaplint/default_config.json`)
- Supports abapGit file naming conventions (`.prog.abap`, `.clas.abap`, `.intf.abap`, etc.)

### abaplint transpiler (`@abaplint/transpiler`)
- GitHub: https://github.com/abaplint/transpiler
- Purpose: Transpiles ABAP source code to JavaScript
- Enables running ABAP code in the browser for preview/testing
- Supports WRITE output, basic ABAP statements, internal tables
- Use a Web Worker for sandboxed execution of transpiled code

### Monaco Editor
- Use `@monaco-editor/react` for the React wrapper
- Register ABAP language via `monaco.languages.register({ id: 'abap' })`
- Set Monarch tokenizer via `monaco.languages.setMonarchTokensProvider('abap', abapMonarch)`

## Design Requirements

- **Dark theme by default** (SAP developers live in dark mode) with a light theme option
- **ABAP-aware colors**: Keywords in blue, strings in green, comments in gray, system variables in orange, types in teal
- **Responsive**: Works on 1280px+ screens, sidebar collapsible for smaller screens
- **Keyboard-first**: Every action accessible via keyboard shortcut or command palette
- **Fast**: Editor should load and be interactive in < 2 seconds
- **Offline-capable**: In-browser abaplint linting works without any backend connection

## Important Notes

1. **abaplint runs in-browser**: Use `@abaplint/core` npm package for immediate, zero-latency linting. This is independent of the Go backend. The backend LSP provides additional SAP-live diagnostics (syntax check against the real system).

2. **Dual diagnostic sources**: Merge diagnostics from in-browser abaplint AND the LSP backend. Use different source labels ("abaplint" vs "SAP") so developers can distinguish.

3. **abaplint transpiler for preview**: The transpiler converts ABAP to JS. Run transpiled code in a Web Worker with a mock runtime that captures WRITE output. This is a killer feature — no other ABAP editor lets you preview code execution without a SAP system.

4. **The Go backend already exists**: Don't rebuild what abaper already provides. The editor is a frontend that consumes the REST API and LSP. Focus on the editor experience, not backend logic.

5. **abapGit file conventions**: Use the same naming conventions as abapGit (`.prog.abap`, `.clas.abap`, `.intf.abap`, `.fugr.abap`) for compatibility.

6. **Case insensitivity**: ABAP is case-insensitive. The Monarch grammar must use case-insensitive matching. Search and completions should be case-insensitive.

7. **No authentication in editor**: The editor talks to the abaper backend which handles SAP authentication. The editor just needs the backend URL.

## Success Criteria

Phase 1 is complete when:
- [ ] Monaco editor loads with full ABAP syntax highlighting via Monarch grammar
- [ ] abaplint runs in-browser and shows diagnostics in the Problems panel as you type
- [ ] abaplint transpiler converts ABAP to JS and shows output in the Transpiler panel
- [ ] Can open an ABAP object from SAP via quick-open dialog (Cmd+P → REST API)
- [ ] Can save changes back to SAP (Cmd+S → REST API)
- [ ] Can activate objects (Cmd+Shift+A → REST API)
- [ ] Multiple tabs with dirty state tracking
- [ ] Status bar shows connection state and cursor position
- [ ] Docker deployment works with docker-compose
- [ ] Dark + light theme support
