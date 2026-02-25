# ABAPer Agent — Roadmap Status

Last updated: 2026-02-25

## Completed

| Phase | Name | Repos | Summary |
|-------|------|-------|---------|
| **Phase 0** | Baseline Hardening | abaper-mcp, cai-llm-router | Idempotency guards, system_prompt_file, tool filtering, tool name normalization, empty response fallback |
| **FIX-1** | Dev Environment | abaper-editor | docker-compose.dev.yml, Makefile, air hot-reload for Go services, Vite proxy config |
| **Phase 1** | Composite `create-and-activate` Tool | abaper-mcp | Single tool replaces 3-6 iteration get→create→activate→fix→retry pattern. Supports PROG, CLAS, INTF, INCL, DDLS. Returns structured output with step audit trail and line-level activation errors. |
| **Phase 3** | Structured SSE Events | cai-llm-router, abaper-editor | `stream_tool_execution` and `stream_artifact` events. Frontend shows collapsible tool execution log and artifact status badges. Events only emitted in agent mode (SuppressChunks=true). |
| **Phase 5** | Config-Driven Prompt Conditioning | cai-llm-router | Hot-reloadable LLM profiles via NATS KV. ProfileManager with atomic reads, KV watch for live swaps, per-environment overrides. Only applies to abaper agent. |

## Gated (implement when criteria met)

| Phase | Name | Gate Criteria |
|-------|------|---------------|
| **Phase 2** | Temporal Orchestration | Users regularly issue multi-artifact prompts (5+ artifacts with dependencies). Phase 1's per-tool approach is insufficient for inter-artifact dependency chains. Need resume-on-crash for long-running workflows. |
| **Phase 4** | Large Payload Strategy | NATS message rejections observed due to >1MB payloads. Currently theoretical — no rejections seen. |

## RAG (Retrieval-Augmented Generation)

| Tier | Name | Status | Gate Criteria |
|------|------|--------|---------------|
| **RAG-0** | Error Pattern Retrieval | **Next** | None — implement now |
| **RAG-1** | Code Pattern Retrieval | Gated | RAG-0 proven useful. Agent still generates incorrect ABAP on first attempt. |
| **RAG-2** | SAP System Knowledge (XPro) | Gated | RAG-1 proven useful. Agent fails on type resolution / API discovery. Daily sync via XPro → PostgreSQL + pgvector. |

## Phase Details

### Phase 1 — Composite Tool

**Problem**: LLM wastes 50-70% of iterations on boilerplate (get-object → create → activate → read error → update → activate).

**Solution**: `create-and-activate` tool in abaper-mcp. Single call handles: validate type → check existence → create or update → activate → return structured result.

**Files changed**:
- `abaper-mcp/tools.go` — tool registration + handler
- `abaper-mcp/apiclient.go` — fixed activation JSON tag (`activated` not `success`), polymorphic `ActivateMessage.Text`, rewrote `Activate()` to preserve error data

### Phase 3 — Structured SSE Events

**Problem**: Frontend shows "Thinking..." with no visibility into multi-step tool execution.

**Solution**: Two new SSE event types emitted during agent mode.

| Event | Fields | When |
|-------|--------|------|
| `stream_tool_execution` | tool_name, status, duration_ms, result_summary, iteration | After each tool call completes |
| `stream_artifact` | artifact_name, artifact_type, action, success, message | When tool matches create/update/activate pattern |

**Files changed**:
- `cai-llm-router/internal/messages/response.go` — event types + constructors
- `cai-llm-router/internal/handler/mcp_handler.go` — timing, emit, detectArtifact()
- `abaper-editor/src/services/cai.ts` — ChatEvent type extension
- `abaper-editor/src/stores/aiStore.ts` — ToolExecution/ArtifactEvent state
- `abaper-editor/src/hooks/useAIAssistant.ts` — event handlers
- `abaper-editor/src/components/panels/AIPanel.tsx` — ToolExecutionLog + ArtifactBadges components

### Phase 5 — LLM Profiles

**Problem**: Changing the LLM system prompt requires editing files and restarting containers. No way to A/B test prompts or quickly roll back.

**Solution**: NATS KV bucket `llm-profiles` stores YAML profiles. ProfileManager watches `_active` key for hot-reload. Profiles override system prompt, model, and max_iterations for the abaper agent.

**Files created**:
- `cai-llm-router/internal/policy/profiles.go` — ProfileManager, LLMProfile types
- `cai-llm-router/internal/policy/profiles_test.go` — 11 tests

**Files modified**:
- `cai-llm-router/internal/policy/resolver.go` — SetProfileManager(), applyProfile()
- `cai-llm-router/cmd/server/main.go` — JetStream KV init, profile watcher goroutine

**First run**: KV bucket auto-created. Builtin default has empty system prompt (does NOT override agents.yaml). Profiles only take effect when explicitly seeded.

**Seeding profiles**:
```bash
# From NATS container or any host with nats CLI
nats kv put llm-profiles abaper_default < profile.yaml
nats kv put llm-profiles _active 'abaper_default'
```

### RAG-0 — Error Pattern Retrieval

**Problem**: When `create-and-activate` fails with activation errors, the LLM guesses fixes from scratch. Same errors repeat across sessions with no learning.

**Solution**: NATS KV bucket `rag-error-patterns` stores error→fix pairs. Auto-populated after successful retries (tool fails → LLM fixes → tool succeeds). Retrieved before LLM retry — top matches injected as system message context.

**Repo**: `cai-llm-router`

**Files to create**:
- `internal/rag/errors.go` — ErrorPatternStore wrapping NATS KV

**Files to modify**:
- `internal/handler/mcp_handler.go` — query/store error patterns in agentic loop
- `internal/handler/chat.go` — add ragStore field
- `cmd/server/main.go` — initialize ErrorPatternStore (same pattern as ProfileManager)
- `config/agents.yaml` — add `retrieval.enabled: true`

**Design doc**: [`PHASE-RAG.md`](PHASE-RAG.md)

### Phase 2 — Temporal Orchestration (Gated)

Plan → execute pattern for multi-artifact prompts. LLM generates an artifact plan, Temporal orchestrates sequential/parallel creation with per-activity retry and crash recovery.

### Phase 4 — Large Payload Strategy (Gated)

NATS Object Store for payloads exceeding the ~1MB per-message limit. Transparent envelope: publish reference, receiver fetches from Object Store.
