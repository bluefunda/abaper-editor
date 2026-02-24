# Resilient Multi-Artifact Execution — Architecture Proposal

## Current State Summary

| Component | Key Facts |
|-----------|-----------|
| **cai-llm-router** | Temporal workflows (AbaperWorkflow: 30m timeout, 2 retries). Agent loop in `mcp_handler.go` iterates up to `max_iterations` (25 for abaper). Tool errors stringified and fed back to LLM as tool result messages. |
| **cai-bff** | Pure SSE passthrough. 100-buffer event channel. No payload validation. Raw JSON forwarding. |
| **abaper-mcp** | 14 tools, 7 prompts, 8 resources. **No idempotency checks** — `CreateObject()` calls `/api/v1/objects/create` without existence check. Errors are unstructured `fmt.Errorf()` strings. 60s HTTP timeout. |
| **abaper-ts** | Express REST proxy to SAP ADT. Connection pooling. Create endpoint handles both create (with description) and save (without). Activation returns real SAP result. |
| **NATS** | Default ~1MB per-message limit. JetStream: 1GB total, 7-day retention. No chunking. |
| **agents.yaml** | Abaper agent: `max_iterations: 25`, `mcp_servers: [abaper-mcp]`, system prompt exists but minimal. Requires container restart to change. |

---

## Phase 0 — Baseline Hardening (Minimal Change)

### 0.1 — Idempotency Guard in abaper-mcp Create Handlers

**Problem**: `HandleCreateProgram` and `HandleCreateClass` call `apiClient.CreateObject()` directly. If the LLM retries (or the object already exists), SAP returns an error and the agent loop wastes an iteration.

**Change**: In `tools.go`, add a get-before-create check in each create handler.

**File**: `abaper-mcp/tools.go` — `HandleCreateProgram()` (line 331) and `HandleCreateClass()` (line 380)

```go
// Before:
err := h.apiClient.CreateObject("PROG", input.Name, ...)

// After:
existing, _ := h.apiClient.GetObject("PROG", input.Name, "")
if existing != nil && existing.Source != "" {
    // Object exists — update instead of create
    err := h.apiClient.UpdateObject("PROG", input.Name, input.SourceCode)
    if err != nil {
        return nil, output, nil // return error output
    }
    // Activate after update
    result, _ := h.apiClient.Activate("PROG", input.Name)
    return nil, CreateProgramOutput{
        Success: true,
        Message: fmt.Sprintf("Program %s already existed — updated and %s",
            input.Name, activationStatus(result)),
        Name: input.Name,
    }, nil
}
// Original create path
err := h.apiClient.CreateObject("PROG", input.Name, ...)
```

**Manual test**: Prompt the AI to create a class that already exists (e.g., `ZCL_WEATHER_TIME`). Verify it updates rather than errors.

**Rollback**: Revert `tools.go` to previous version. No state changes.

**Risk**: Low. Get-before-create adds one extra HTTP call (~0.5s). No new dependencies.

---

### 0.2 — Harden the Abaper Agent System Prompt

**Problem**: The current system prompt in `agents.yaml` doesn't instruct the LLM to follow a disciplined create → validate → activate workflow. The LLM decides its own order, sometimes skipping syntax checks or not retrying on failure.

**Change**: Update `config/agents.yaml` on the apps node **and** in the cai-llm-router repo.

**File**: `cai-llm-router/config/agents.yaml` — `agents.abaper.system_prompt`

```yaml
agents:
  abaper:
    system_prompt: |
      You are an SAP ABAP development assistant with direct access to a live SAP system via MCP tools.

      ## Execution Rules

      1. ALWAYS follow this order for creating objects:
         a. Check if the object exists using get-object
         b. If it exists and you need to modify, use update-program or update-class
         c. If it does not exist, use create-program or create-class
         d. After creation/update, ALWAYS call activate-object
         e. If activation fails, read the error messages, fix the source, and retry (max 3 attempts)

      2. For multi-artifact requests (e.g., "create OData service"):
         a. Plan the artifacts in dependency order (data elements → structures → tables → classes → service)
         b. Create and activate each artifact before moving to the next
         c. If any artifact fails after 3 fix attempts, stop and report what succeeded and what failed

      3. After EVERY create or update:
         - Call activate-object to compile the object
         - If activation returns errors, analyze the error messages
         - Fix the source code and call update + activate again
         - Do NOT tell the user activation succeeded unless the tool returned success: true

      4. Response format:
         - Lead with a brief summary of what you did
         - List each artifact created/modified with its status
         - If any errors remain, explain them clearly

      ## Tool Usage
      - get-object: Always check existence before creating
      - create-class/create-program: Only for NEW objects
      - update-class/update-program: For EXISTING objects (provide complete source, not diffs)
      - activate-object: MUST call after every create/update
      - syntax-check: Use proactively before activate if you're unsure about the code
      - run-unit-tests: Only after successful activation
```

**Manual test**: Prompt `create class YCL_TEST_IDEMPOTENT with a simple method`. Verify the AI follows the get → create → activate → verify flow. Then prompt `create class YCL_TEST_IDEMPOTENT with a different method` and verify it updates instead of failing.

**Rollback**: Revert `agents.yaml` to previous system prompt. Restart cai-llm-router container.

**Risk**: Low. Prompt-only change. No code changes.

---

### 0.3 — Structured Error Responses from MCP Tools

**Problem**: All tool errors are unstructured strings like `"API error from /api/v1/objects/create: object already exists"`. The LLM has to parse natural language to understand what failed.

**Change**: Add structured error fields to output types in `tools.go`.

**File**: `abaper-mcp/tools.go` — all Output structs and handlers

```go
// Add to all create/update/activate outputs:
type CreateProgramOutput struct {
    Success     bool     `json:"success"`
    Message     string   `json:"message"`
    Name        string   `json:"name"`
    ErrorCode   string   `json:"error_code,omitempty"`   // NEW: "ALREADY_EXISTS", "SYNTAX_ERROR", "ACTIVATION_FAILED", "SAP_ERROR"
    ErrorDetail string   `json:"error_detail,omitempty"` // NEW: structured detail
    Errors      []string `json:"errors,omitempty"`        // NEW: list of individual errors
}
```

For activation failures specifically:
```go
// In HandleActivateObject, instead of:
message = "Activation failed: " + strings.Join(msgs, "; ")

// Return:
return nil, ActivateObjectOutput{
    Success:     false,
    Message:     "Activation failed",
    ErrorCode:   "ACTIVATION_FAILED",
    ErrorDetail: strings.Join(msgs, "; "),
    Errors:      msgs,  // Individual error messages
    ObjectName:  input.ObjectName,
    ObjectType:  input.ObjectType,
}, nil
```

**Manual test**: Create a class with intentional syntax error. Verify the MCP tool returns `error_code: "ACTIVATION_FAILED"` with structured `errors` array, and the LLM references specific errors in its retry.

**Rollback**: Revert `tools.go`. Output fields are additive — old consumers ignore unknown fields.

**Risk**: Low. Additive JSON fields. No breaking changes.

---

### 0.4 — Increase NATS Max Payload

**Problem**: NATS default `max_payload` is 1MB. A large ABAP class (e.g., 5000+ lines) plus LLM reasoning can exceed this.

**Change**: Set `max_payload` in NATS server config.

**File**: NATS server config on apps node (e.g., `nats-server.conf` or Docker compose env)

```
max_payload: 8388608  # 8 MB
```

**Manual test**: Use the AI to fetch a very large SAP standard class (e.g., `CL_GUI_ALV_GRID`). Verify the full source returns without NATS errors in cai-llm-router logs.

**Rollback**: Set `max_payload` back to default (1048576). Restart NATS.

**Risk**: Low. Memory increase is bounded (8MB * concurrent messages). Monitor NATS memory after change.

---

### Phase 0 Summary

| Change | Service | Files | Latency Impact | Ops Complexity | Observability | Failure Modes |
|--------|---------|-------|----------------|----------------|---------------|---------------|
| 0.1 Idempotency | abaper-mcp | `tools.go` | +0.5s per create (extra GET) | None | Better: logs show "updated existing" vs "created new" | GET may fail (handled: falls through to create) |
| 0.2 System prompt | cai-llm-router | `agents.yaml` | None (prompt is cached) | None | Better: LLM follows predictable patterns | Prompt too long → truncation (unlikely at ~800 tokens) |
| 0.3 Structured errors | abaper-mcp | `tools.go` | None | None | Better: error codes enable dashboarding | None — additive fields |
| 0.4 NATS payload | NATS server | `nats-server.conf` | None | Low (config change) | Monitor NATS memory | Large messages consume more RAM |

---

## Phase 1 — Controlled Retry Loop

### Problem

The LLM's agentic loop (max 25 iterations) is the only retry mechanism. It's non-deterministic — the LLM may or may not retry on failure, may generate different code each time, or may apologize instead of fixing.

### Approach: Tool-Level Retry in abaper-mcp

Add a `create-and-activate` composite tool that wraps the create → syntax-check → activate flow with deterministic retries. This runs **inside abaper-mcp**, not in the LLM loop.

**Why not Temporal here?** Temporal is already used by cai-llm-router for the outer workflow. Adding Temporal for inner tool retries would require abaper-mcp to be a Temporal worker — unnecessary coupling for what is fundamentally a synchronous HTTP call chain.

**Why not LLM-driven retry?** The LLM loop should handle **semantic** retries (wrong approach, missing requirement). Mechanical retries (syntax fix, activation retry) should be deterministic.

### New Tool: `create-and-activate`

**File**: `abaper-mcp/tools.go` — new handler

```go
type CreateAndActivateInput struct {
    ObjectType  string `json:"object_type" jsonschema:"Type: program or class"`
    Name        string `json:"name" jsonschema:"Object name"`
    Description string `json:"description" jsonschema:"Object description"`
    Package     string `json:"package" jsonschema:"Package ($TMP for local)"`
    SourceCode  string `json:"source_code" jsonschema:"Complete ABAP source"`
    MaxRetries  int    `json:"max_retries,omitempty" jsonschema:"Max fix attempts (default 2)"`
}

type CreateAndActivateOutput struct {
    Success    bool             `json:"success"`
    Message    string           `json:"message"`
    Name       string           `json:"name"`
    Activated  bool             `json:"activated"`
    Attempts   int              `json:"attempts"`
    History    []AttemptRecord  `json:"history"`
}

type AttemptRecord struct {
    Attempt    int      `json:"attempt"`
    Action     string   `json:"action"`    // "created", "updated", "activated", "syntax_error", "activation_failed"
    Success    bool     `json:"success"`
    Errors     []string `json:"errors,omitempty"`
}
```

**Retry Logic (pseudocode)**:

```
func HandleCreateAndActivate(input):
    maxRetries = input.MaxRetries or 2
    history = []

    // Step 1: Check existence, create or update
    existing = apiClient.GetObject(type, name)
    if existing != nil:
        apiClient.UpdateObject(type, name, source)
        history.append({action: "updated", success: true})
    else:
        apiClient.CreateObject(type, name, desc, source, pkg)
        history.append({action: "created", success: true})

    // Step 2: Activate with retry
    for attempt = 1 to maxRetries + 1:
        result = apiClient.Activate(type, name)
        if result.Success:
            history.append({action: "activated", success: true})
            return {success: true, activated: true, attempts: attempt, history}

        errors = extractErrors(result.Messages)
        history.append({action: "activation_failed", errors: errors})

        if attempt > maxRetries:
            break

        // Return errors to LLM for this tool call — LLM will see
        // the structured error and can call create-and-activate
        // again with fixed source
        return {
            success: false,
            activated: false,
            attempts: attempt,
            message: "Activation failed. Fix the following errors and call this tool again with corrected source.",
            history: history,
        }

    return {success: false, activated: false, message: "Max retries exceeded", history}
```

**Key design decision**: The tool does NOT loop internally for source fixes — it can't fix ABAP code. Instead, it returns structured errors to the LLM after each attempt. The LLM fixes the source and calls `create-and-activate` again. This keeps the LLM in the loop for intelligence while giving us deterministic state tracking via `history`.

The agent's `max_iterations: 25` provides the outer bound — at 2-3 tool calls per artifact (create + activate + maybe fix), this supports ~8 artifacts per prompt.

### Failure Simulation

1. Create a class with a deliberate syntax error (misspelled keyword)
2. Verify `create-and-activate` returns structured errors with `activation_failed` action
3. Verify the LLM fixes the source and retries
4. Check `history` array shows the full attempt sequence

### Rollback

Remove the `create-and-activate` tool registration. The original `create-class` and `create-program` tools remain unchanged. The system prompt can reference either.

### Phase 1 Impact

| Metric | Impact |
|--------|--------|
| **Latency** | +1-2s per artifact (extra syntax-check + activate in one tool call vs. separate calls) |
| **Ops complexity** | Low — single Go handler addition |
| **Observability** | High — `history` array gives full audit trail per artifact |
| **Failure modes** | If abaper-ts is down, all attempts fail fast (60s timeout). No infinite retry risk — bounded by `max_retries` (tool-level) and `max_iterations` (agent-level). |

---

## Phase 2 — Temporal Orchestration (Gated)

### Gate Criteria

Introduce this phase ONLY when:
- Users regularly issue multi-artifact prompts (5+ artifacts)
- Phase 1 retry is insufficient due to inter-artifact dependencies
- There is a need to resume after partial failure (e.g., 3 of 5 artifacts created, system went down)

### Workflow Model

Leverage the existing `AbaperWorkflow` in cai-llm-router. Currently it's a thin wrapper around `ProcessAbaperChat` activity. Enhance it to support a plan-execute pattern.

**File**: `cai-llm-router/internal/temporal/abaper_workflow.go`

```
AbaperWorkflow(input ChatWorkflowInput)
  │
  ├── Activity: PlanArtifacts(prompt) → ArtifactPlan
  │     LLM call with constrained output: JSON array of {type, name, depends_on}
  │
  ├── Activity: CreateArtifact(artifact[0]) → ArtifactResult
  │     Calls abaper-mcp create-and-activate via MCP
  │     Retry policy: 2 attempts, fixed 2s backoff
  │
  ├── Activity: CreateArtifact(artifact[1]) → ArtifactResult
  │     Only runs if artifact[0] succeeded (dependency check)
  │
  └── ... (sequential for dependent, parallel for independent)
```

**ArtifactPlan structure**:
```go
type ArtifactPlan struct {
    Artifacts []PlannedArtifact `json:"artifacts"`
}

type PlannedArtifact struct {
    Type       string   `json:"type"`        // "CLAS", "PROG", "TABL", etc.
    Name       string   `json:"name"`
    DependsOn  []string `json:"depends_on"`  // Names of prerequisite artifacts
    Source     string   `json:"source"`
    Package    string   `json:"package"`
}
```

### Activity Boundaries

| Activity | Input | Output | Timeout | Retries |
|----------|-------|--------|---------|---------|
| `PlanArtifacts` | User prompt + context | `ArtifactPlan` JSON | 60s | 1 |
| `CreateArtifact` | Single `PlannedArtifact` | `ArtifactResult` | 120s | 2 (fixed 2s backoff) |
| `ValidatePlan` | `ArtifactPlan` | Validated plan (cycle check, name validation) | 5s | 0 |

### Resume Semantics

Temporal provides this natively:
- Each completed activity is persisted in Temporal history
- On workflow restart, Temporal replays completed activities from history (no re-execution)
- `CreateArtifact` is idempotent (Phase 0.1) — safe to retry
- Workflow state queryable: `temporal workflow describe -w <workflow_id>`

### Manual Replay Testing

```bash
# 1. Start a multi-artifact prompt
# 2. Kill cai-llm-router mid-execution (after 2 of 5 artifacts)
docker stop cai-llm-router

# 3. Check Temporal UI: workflow should be "Running" with 2 completed activities
temporal workflow describe -w <id>

# 4. Restart cai-llm-router
docker start cai-llm-router

# 5. Temporal worker picks up workflow, resumes from activity 3
# 6. Verify only artifacts 3-5 are created (1-2 were already done)
```

### Rollback

Revert `abaper_workflow.go` to the single-activity version. Temporal workflows in-flight will fail and need manual termination:
```bash
temporal workflow terminate -w <id> --reason "Rollback to simple workflow"
```

### Phase 2 Impact

| Metric | Impact |
|--------|--------|
| **Latency** | +2-5s per prompt (plan generation step). Individual artifacts: same as Phase 1. |
| **Ops complexity** | Medium — Temporal UI needed for monitoring. Already running on apps. |
| **Observability** | High — full workflow history in Temporal, per-activity timing, retry counts. |
| **Failure modes** | Plan generation may produce invalid artifact order (mitigated by `ValidatePlan`). Temporal server down → prompts fail (mitigated by existing Temporal HA setup). Stale workflows from rollback → manual cleanup. |

---

## Phase 3 — Response Structuring

### Problem

SSE currently streams untyped text chunks. The UI cannot distinguish between:
- User-facing summary ("Created YCL_TEST successfully")
- Tool execution logs ("Called create-class with 250 lines of source")
- LLM reasoning ("The class needs a constructor because...")
- Artifacts ("YCL_TEST — CLAS — activated")

### JSON Contract

Extend the existing SSE event types in `cai-llm-router/internal/messages/response.go`.

**New event types** (additive — existing `stream_chunk` continues to work):

```go
// StreamToolExecution — emitted when a tool is called
type StreamToolExecution struct {
    Type       string         `json:"type"`        // "tool_execution"
    ToolName   string         `json:"tool_name"`   // "create-and-activate"
    Status     string         `json:"status"`       // "started", "completed", "failed"
    Input      map[string]any `json:"input,omitempty"`
    Output     map[string]any `json:"output,omitempty"`
    DurationMs int64          `json:"duration_ms,omitempty"`
    Timestamp  string         `json:"timestamp"`
}

// StreamArtifact — emitted when an ABAP object is created/modified
type StreamArtifact struct {
    Type       string `json:"type"`        // "artifact"
    ObjectType string `json:"object_type"` // "CLAS", "PROG", etc.
    ObjectName string `json:"object_name"` // "YCL_TEST"
    Action     string `json:"action"`      // "created", "updated", "activated", "failed"
    Activated  bool   `json:"activated"`
    Timestamp  string `json:"timestamp"`
}

// StreamSummary — emitted at the end of the response
type StreamSummary struct {
    Type       string            `json:"type"`       // "summary"
    Text       string            `json:"text"`       // Human-readable summary
    Artifacts  []ArtifactSummary `json:"artifacts"`  // List of what was created
    Success    bool              `json:"success"`    // Overall success
}
```

### Emission Points

**File**: `cai-llm-router/internal/handler/mcp_handler.go`

```go
// Before tool execution (line ~134):
h.publish(subjects.Reply, messages.NewToolExecution(tc.Function.Name, "started", args, nil))

// After tool execution (line ~140):
h.publish(subjects.Reply, messages.NewToolExecution(tc.Function.Name, status, args, parsedResult))

// Parse abaper-mcp results for artifact events:
if isAbaperTool(tc.Function.Name) {
    artifact := parseArtifactFromResult(tc.Function.Name, result)
    if artifact != nil {
        h.publish(subjects.Reply, artifact)
    }
}
```

**End of stream** (line ~156, when `len(toolCalls) == 0`):
```go
// After final LLM response:
summary := buildSummary(session.artifacts)
h.publish(subjects.Reply, summary)
```

### UI Handling Strategy

**File**: `abaper-editor/src/services/cai.ts` and `abaper-editor/src/components/panels/AIPanel.tsx`

In `cai.ts`, parse SSE events by type:
```typescript
switch (event.type) {
  case 'stream_chunk':
    // Existing: append to chat message
    break;
  case 'tool_execution':
    // New: append to collapsible "Execution Log" section
    break;
  case 'artifact':
    // New: add to artifact sidebar/badge
    break;
  case 'summary':
    // New: display as highlighted card at end
    break;
}
```

In AIPanel, render with collapsible sections:
- **Summary** — always visible (from `stream_summary`)
- **Artifacts** — badges showing object names + status
- **Details** — collapsed by default, contains `stream_chunk` text
- **Execution Log** — collapsed by default, contains `tool_execution` events

### Backward Compatibility

The `stream_chunk` event type continues to stream the full LLM text response unchanged. New event types are additive. Old clients (or if UI hasn't been updated) simply ignore unknown event types — the raw text is still complete and readable.

**Incremental rollout**:
1. Deploy cai-llm-router with new event types → old UI ignores them, works fine
2. Deploy abaper-editor with new rendering → picks up new events when available
3. No simultaneous deploy required

### Phase 3 Impact

| Metric | Impact |
|--------|--------|
| **Latency** | +1-2ms per tool call (JSON serialization of tool_execution event). Negligible. |
| **Ops complexity** | Low — additive SSE events |
| **Observability** | High — tool_execution events enable timing dashboards, artifact tracking |
| **Failure modes** | Malformed event JSON → client ignores (safe). Large tool output in event → addressed in Phase 4. |

---

## Phase 4 — Large Payload Strategy

### Current Limits

| Boundary | Limit | Risk |
|----------|-------|------|
| NATS per-message | 1 MB (default) | Large ABAP classes (5000+ lines) + LLM context can exceed |
| KrakenD body | 10 MB (abaper-gw) | Safe for individual requests |
| abaper-ts Express | 10 MB JSON body | Safe |
| SSE per-chunk | Unbounded | No risk — chunked by nature |
| cai-bff event buffer | 100 events | Backpressure if consumer is slow |

### Options Comparison

| Approach | Complexity | Latency | Reliability | Incremental? |
|----------|-----------|---------|-------------|-------------|
| **Increase NATS max_payload** | Trivial | None | Same | Yes (Phase 0.4) |
| **NATS JetStream chunking** | Medium | +50ms reassembly | Higher (ACK per chunk) | Requires both publisher and consumer changes |
| **Object storage (MinIO/S3)** | High | +100-200ms (upload + signed URL) | Highest (durable) | Requires new service dependency |
| **Signed URL pattern** | High | +100-200ms | High | Requires object storage first |
| **SSE streaming (status quo)** | None | None | Good for frontend | Already works |

### Recommended Path

**Stage 1** (Phase 0.4): Increase NATS `max_payload` to 8MB. This handles 95% of cases immediately. No code changes.

**Stage 2** (if 8MB is still insufficient): Use NATS Object Store.

NATS Object Store is built into NATS JetStream — no new infrastructure. It stores large blobs and returns a reference.

**File**: `cai-llm-router/internal/nats/client.go`

```go
// For payloads > threshold (e.g., 4MB):
func (c *Client) publishLargePayload(subject string, data []byte) error {
    if len(data) <= largePayloadThreshold {
        return c.Publish(subject, data)
    }
    // Store in NATS Object Store
    obj, err := c.objectStore.PutBytes("payload-"+uuid(), data)
    // Publish reference
    ref := PayloadReference{Type: "nats_object", Key: obj.Name}
    return c.Publish(subject, ref)
}

// Consumer side:
func (c *Client) resolvePayload(event *ChatEvent) ([]byte, error) {
    if event.PayloadRef != nil {
        return c.objectStore.GetBytes(event.PayloadRef.Key)
    }
    return event.RawJSON, nil
}
```

**Stage 3** (future, if NATS Object Store is insufficient): MinIO with signed URLs. Only consider if payloads regularly exceed 50MB or need cross-service durability.

### Migration Path

```
Phase 0.4: max_payload=8MB           ← Do now
   │
   └── Monitor: are messages still being rejected?
         │
         ├── No → Done. Stay here.
         │
         └── Yes → Stage 2: NATS Object Store
                     │
                     └── Monitor: is Object Store sufficient?
                           │
                           ├── Yes → Done.
                           └── No → Stage 3: MinIO (unlikely)
```

### Phase 4 Impact

| Metric | Stage 1 (max_payload) | Stage 2 (Object Store) |
|--------|----------------------|----------------------|
| **Latency** | None | +20-50ms per large payload |
| **Ops complexity** | Trivial | Low (built into NATS) |
| **Observability** | NATS metrics show message sizes | Object Store metrics: count, size, TTL |
| **Failure modes** | OOM if many 8MB messages concurrent | Object Store full → falls back to error |

---

## Phase 5 — Config-Driven Prompt Conditioning

### Problem

The abaper agent's system prompt is hardcoded in `agents.yaml` which requires a container restart (or at minimum, cai-llm-router restart) to change. There's no way to:
- A/B test different prompt strategies
- Adjust behavior per environment (dev = verbose, prod = terse)
- Version and roll back prompt changes
- Hot-reload without restart

### Config Format

```yaml
# llm_profiles.yaml
llm_profiles:
  abaper_default:
    version: "1.2.0"
    model: "claude-sonnet-4-5-20250514"
    system_prompt: |
      You are an SAP ABAP development assistant...
      [full prompt text]
    persona: "expert_developer"
    constraints:
      max_retries: 2
      repair_mode: true
      require_activation: true
      require_syntax_check: false
      artifact_order: "dependency"
    response_format:
      include_summary: true
      include_reasoning: false
      include_execution_log: false
    environment_overrides:
      dev:
        constraints:
          max_retries: 5
          require_syntax_check: true
        response_format:
          include_reasoning: true
          include_execution_log: true
      prod:
        constraints:
          max_retries: 2

  abaper_verbose:
    version: "1.0.0"
    parent: "abaper_default"   # Inherits, overrides below
    response_format:
      include_reasoning: true
      include_execution_log: true

  abaper_experimental:
    version: "0.1.0"
    model: "claude-opus-4-6"
    system_prompt: |
      [experimental prompt with different strategy]
    constraints:
      max_retries: 3
      repair_mode: true
```

### Where Config Lives

**NATS KV store** — already in the stack, supports watching for changes.

```
Bucket: llm-profiles
Keys:
  abaper_default     → YAML content
  abaper_verbose     → YAML content
  abaper_experimental → YAML content
  _active            → "abaper_default"  (which profile is active)
```

**Why NATS KV and not file-based?**
- cai-llm-router already connects to NATS
- KV supports `Watch()` for real-time change notifications — true hot reload
- KV stores revision history natively — built-in versioning
- File-based would require mounted volumes and file watchers — more ops complexity

### Hot Reload Strategy

**File**: `cai-llm-router/internal/policy/profiles.go` (new)

```go
type ProfileManager struct {
    kv       jetstream.KeyValue
    current  atomic.Value  // *LLMProfile
    onChange func(*LLMProfile)
}

func (pm *ProfileManager) Watch(ctx context.Context) {
    watcher, _ := pm.kv.Watch(ctx, "_active")
    for entry := range watcher.Updates() {
        profileName := string(entry.Value())
        profile := pm.loadProfile(profileName)
        pm.current.Store(profile)
        pm.onChange(profile)
    }
}
```

In the agent resolution path (`resolver.go`), read the active profile:
```go
func (r *Resolver) Resolve(req *messages.ChatRequest) AgentConfig {
    // Existing routing logic...
    if agent.Name == "abaper" {
        profile := r.profileManager.Current()
        agent.SystemPrompt = profile.SystemPrompt
        agent.MaxIterations = profile.Constraints.MaxRetries * 3  // iterations per retry
    }
    return agent
}
```

### Versioning Strategy

NATS KV provides revision numbers automatically. Each put increments the revision. To roll back:

```bash
# Check current revision
nats kv get llm-profiles abaper_default

# Put previous version
nats kv put llm-profiles abaper_default < /path/to/previous-version.yaml

# Or: restore from revision (via API)
nats kv history llm-profiles abaper_default
```

For formal versioning, the `version` field in the YAML config enables:
- Logging which version served each request
- Auditing prompt changes over time
- Comparing metrics between versions

### A/B Testing Approach

Add a `routing_weight` concept to the active profile selection:

```yaml
# NATS KV key: _routing
routing:
  - profile: abaper_default
    weight: 90    # 90% of requests
  - profile: abaper_experimental
    weight: 10    # 10% of requests
```

In the resolver:
```go
func (r *Resolver) selectProfile() *LLMProfile {
    routing := r.profileManager.Routing()
    roll := rand.Intn(100)
    cumulative := 0
    for _, entry := range routing {
        cumulative += entry.Weight
        if roll < cumulative {
            return r.profileManager.Load(entry.Profile)
        }
    }
    return r.profileManager.Default()
}
```

Log which profile was used per request for metrics comparison.

### Manual Test Approach

```bash
# 1. Put a test profile
nats kv put llm-profiles abaper_test '
version: "0.0.1"
system_prompt: "You are a test assistant. Always respond with: TEST MODE ACTIVE"
constraints:
  max_retries: 0
'

# 2. Set it active
nats kv put llm-profiles _active 'abaper_test'

# 3. Send a prompt in abaper-editor
#    → Verify response starts with "TEST MODE ACTIVE"

# 4. Roll back
nats kv put llm-profiles _active 'abaper_default'

# 5. Send another prompt
#    → Verify normal behavior restored
```

### Phase 5 Impact

| Metric | Impact |
|--------|--------|
| **Latency** | +1-2ms per request (KV read, cached locally via Watch) |
| **Ops complexity** | Medium — need `nats` CLI or admin UI for profile management |
| **Observability** | High — profile version logged per request, A/B metrics trackable |
| **Failure modes** | NATS KV unavailable → falls back to last-known profile (atomic.Value). Invalid YAML → parse error logged, old profile retained. A/B routing seed not truly random → use request hash for determinism. |

---

## Implementation Order and Dependencies

```
Phase 0.1 (idempotency)     ← Independent, deploy first
Phase 0.2 (system prompt)   ← Independent, deploy first
Phase 0.3 (structured errors)← Independent, deploy first
Phase 0.4 (NATS payload)    ← Independent, deploy first

Phase 1 (create-and-activate tool) ← Depends on 0.1 + 0.3
    │
Phase 3 (response structuring)     ← Independent of Phase 1
    │
Phase 2 (Temporal orchestration)   ← Depends on Phase 1. GATED.
    │
Phase 4 (large payload)            ← Stage 1 in Phase 0. Stage 2 if needed.
    │
Phase 5 (config-driven prompts)    ← Independent. Can deploy anytime after Phase 0.2.
```

**Recommended deployment sequence**:
1. Phase 0 (all four changes) — 1 day
2. Phase 1 — 2-3 days
3. Phase 5 — 2-3 days (can parallel with Phase 1)
4. Phase 3 — 3-5 days (frontend + backend)
5. Phase 2 — Only if Phase 1 proves insufficient for complex prompts
6. Phase 4 Stage 2 — Only if Phase 0.4 proves insufficient
