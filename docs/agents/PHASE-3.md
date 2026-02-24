# Phase 3 — Response Structuring

## Agent Instructions

Independent of Phases 1 and 2. Can be implemented in parallel with Phase 1. Deploy backend changes first, then frontend — no simultaneous deploy required.

---

## Goal

Add typed SSE event types so the frontend can distinguish between user-facing summary, tool execution logs, artifact status, and LLM reasoning. Existing `stream_chunk` continues to work unchanged.

## Repos

- `cai-llm-router` — Go (backend: emit new event types)
- `abaper-editor` — TypeScript/React (frontend: render structured sections)

## Part A: Backend (cai-llm-router)

### Files to Modify

- `internal/messages/response.go` — add new message types
- `internal/handler/mcp_handler.go` — emit events at tool execution boundaries

### New Message Types

Add to `internal/messages/response.go`:

```go
// StreamToolExecution emitted when a tool is called or completes
type StreamToolExecution struct {
    Type       string         `json:"type"`         // "tool_execution"
    ToolName   string         `json:"tool_name"`
    Status     string         `json:"status"`       // "started", "completed", "failed"
    Input      map[string]any `json:"input,omitempty"`
    Output     map[string]any `json:"output,omitempty"`
    DurationMs int64          `json:"duration_ms,omitempty"`
    Timestamp  string         `json:"timestamp"`
}

// StreamArtifact emitted when an ABAP object is created/modified/activated
type StreamArtifact struct {
    Type       string `json:"type"`         // "artifact"
    ObjectType string `json:"object_type"`  // "CLAS", "PROG"
    ObjectName string `json:"object_name"`  // "YCL_TEST"
    Action     string `json:"action"`       // "created", "updated", "activated", "failed"
    Activated  bool   `json:"activated"`
    Timestamp  string `json:"timestamp"`
}

// StreamSummary emitted at end of response
type StreamSummary struct {
    Type      string            `json:"type"`      // "summary"
    Text      string            `json:"text"`
    Artifacts []ArtifactSummary `json:"artifacts"`
    Success   bool              `json:"success"`
}

type ArtifactSummary struct {
    Name      string `json:"name"`
    Type      string `json:"type"`
    Status    string `json:"status"` // "activated", "created", "failed"
}

// Constructors
func NewToolExecution(name, status string, input, output map[string]any, durationMs int64) *StreamToolExecution { ... }
func NewArtifact(objType, objName, action string, activated bool) *StreamArtifact { ... }
func NewSummary(text string, artifacts []ArtifactSummary, success bool) *StreamSummary { ... }
```

### Emission Points in mcp_handler.go

In the agentic loop (`handleMCPRequest` or `handleMultiMCPRequest`), around lines 130-155:

```go
// Before tool execution:
h.publish(subjects.Reply, messages.NewToolExecution(
    tc.Function.Name, "started", args, nil, 0,
))

toolStart := time.Now()
result, err := h.executeTool(ctx, mcpClient, tc)
durationMs := time.Since(toolStart).Milliseconds()

status := "completed"
if err != nil {
    status = "failed"
}

// After tool execution:
h.publish(subjects.Reply, messages.NewToolExecution(
    tc.Function.Name, status, args, parseResultJSON(result), durationMs,
))

// If it's an abaper tool, emit artifact event:
if artifact := extractArtifact(tc.Function.Name, result); artifact != nil {
    h.publish(subjects.Reply, artifact)
}
```

Helper to detect abaper artifact results:
```go
var abaperCreateTools = map[string]bool{
    "create-and-activate": true,
    "create-class":        true,
    "create-program":      true,
    "activate-object":     true,
}

func extractArtifact(toolName, result string) *messages.StreamArtifact {
    if !abaperCreateTools[toolName] {
        return nil
    }
    // Parse result JSON to extract object name, type, activation status
    var parsed map[string]any
    if err := json.Unmarshal([]byte(result), &parsed); err != nil {
        return nil
    }
    name, _ := parsed["name"].(string)
    if name == "" {
        name, _ = parsed["object_name"].(string)
    }
    objType, _ := parsed["object_type"].(string)
    activated, _ := parsed["activated"].(bool)
    success, _ := parsed["success"].(bool)

    action := "created"
    if !success {
        action = "failed"
    }
    return messages.NewArtifact(objType, name, action, activated)
}
```

### What cai-bff Does

Nothing. cai-bff is a passthrough — it forwards raw NATS JSON to SSE. New event types flow through automatically because cai-bff uses `event.RawJSON` for lossless forwarding.

### Test (Backend Only)

1. Deploy updated cai-llm-router
2. Send AI chat prompt: `create class YCL_PHASE3_TEST with a simple method`
3. Watch cai-llm-router debug logs — verify `tool_execution` and `artifact` events are published
4. Open browser DevTools → Network → SSE stream — verify new event types appear in the stream alongside existing `stream_chunk` events
5. Old UI renders correctly (ignores unknown event types)

---

## Part B: Frontend (abaper-editor)

### Files to Modify

- `src/services/cai.ts` — parse new event types from SSE
- `src/stores/aiStore.ts` — add state for tool executions and artifacts
- `src/components/panels/AIPanel.tsx` — render structured sections

### SSE Event Parsing

In `cai.ts`, extend the event handler:

```typescript
// Existing types continue to work:
// stream_start, stream_chunk, stream_heartbeat, stream_end, stream_error

// New types:
interface ToolExecutionEvent {
  type: 'tool_execution';
  tool_name: string;
  status: 'started' | 'completed' | 'failed';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration_ms?: number;
}

interface ArtifactEvent {
  type: 'artifact';
  object_type: string;
  object_name: string;
  action: 'created' | 'updated' | 'activated' | 'failed';
  activated: boolean;
}

interface SummaryEvent {
  type: 'summary';
  text: string;
  artifacts: Array<{ name: string; type: string; status: string }>;
  success: boolean;
}
```

In the SSE message handler, dispatch by type:

```typescript
switch (event.type) {
  case 'stream_chunk':
    // Existing: append to message content
    break;
  case 'tool_execution':
    onToolExecution?.(event as ToolExecutionEvent);
    break;
  case 'artifact':
    onArtifact?.(event as ArtifactEvent);
    break;
  case 'summary':
    onSummary?.(event as SummaryEvent);
    break;
}
```

### AI Store State

In `aiStore.ts`, add:

```typescript
interface AIState {
  // ... existing fields ...
  toolExecutions: ToolExecutionEvent[];
  artifacts: ArtifactEvent[];
  summary: SummaryEvent | null;
}
```

Clear these on new chat message. Append on each event.

### UI Rendering

In `AIPanel.tsx`, render the AI response with collapsible sections:

```
┌──────────────────────────────────────────────┐
│ Summary (always visible)                      │
│ Created YCL_PHASE3_TEST and activated.        │
├──────────────────────────────────────────────┤
│ Artifacts                                     │
│ ✓ YCL_PHASE3_TEST (CLAS) — activated          │
│ ✗ YCL_PHASE3_BROKEN (CLAS) — failed           │
├──────────────────────────────────────────────┤
│ ▶ Details (collapsed)                         │
│   [Full LLM text response from stream_chunk]  │
├──────────────────────────────────────────────┤
│ ▶ Execution Log (collapsed)                   │
│   create-and-activate: 2.3s ✓                 │
│   activate-object: 0.8s ✓                     │
└──────────────────────────────────────────────┘
```

- **Summary**: from `summary` event. If no summary event, fall back to showing the full `stream_chunk` text.
- **Artifacts**: from `artifact` events. Show as badges/pills with status colors.
- **Details**: the existing `stream_chunk` text, collapsed by default if a summary exists.
- **Execution Log**: from `tool_execution` events, collapsed by default.

### Backward Compatibility

- If backend hasn't been updated: no `tool_execution`, `artifact`, or `summary` events arrive. UI falls back to showing `stream_chunk` text as before — no change in behavior.
- If frontend hasn't been updated: unknown event types are ignored by the existing switch/case — no errors.

### Test (Full Stack)

1. Deploy updated cai-llm-router (Part A)
2. Deploy updated abaper-editor (Part B)
3. Send prompt: `create class YCL_PHASE3_FULL with method GET_NAME returning string "test"`
4. Verify:
   - Summary card appears at top with green success indicator
   - Artifact badge shows `YCL_PHASE3_FULL (CLAS) — activated`
   - Details section is collapsed, expandable
   - Execution log shows `create-and-activate: Xs ✓`
5. Send prompt that fails: `get the source of NONEXISTENT_CLASS`
6. Verify: details section shows the error text, no artifact badges

## Rollback

**Backend**: Revert `mcp_handler.go` and `response.go`. New events stop being emitted. Frontend shows `stream_chunk` text as before.

**Frontend**: Revert `cai.ts`, `aiStore.ts`, `AIPanel.tsx`. Unknown events ignored.

## Impact

| Metric | Value |
|--------|-------|
| **Latency** | +1-2ms per tool call (JSON serialization). Negligible. |
| **Ops complexity** | Low — additive changes only |
| **Observability** | Tool execution timing visible in UI. Can be exported for dashboards. |
| **Failure modes** | Malformed event JSON → frontend ignores (safe). Missing summary → fallback to stream_chunk (safe). |
