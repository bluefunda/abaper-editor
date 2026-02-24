# Phase 0 — Baseline Hardening

## Agent Instructions

This phase contains 4 independent changes. Each can be implemented and deployed separately. No ordering required between them.

---

## 0.1 — Idempotency Guard in abaper-mcp

### Goal

Prevent duplicate object creation errors when the LLM retries a create call.

### Repo

`abaper-mcp` — Go

### Files to Modify

- `tools.go` — `HandleCreateProgram()` (line ~331) and `HandleCreateClass()` (line ~380)

### Implementation

In both `HandleCreateProgram` and `HandleCreateClass`, add a get-before-create check at the top of the handler, before the existing `apiClient.CreateObject()` call:

```go
// Check if object already exists
existing, _ := h.apiClient.GetObject(adtType, input.Name, "")
if existing != nil && existing.Source != "" {
    // Object exists — switch to update mode
    err := h.apiClient.UpdateObject(adtType, input.Name, input.SourceCode)
    if err != nil {
        log.Error("Failed to update existing object", zap.Error(err))
        return nil, OutputType{
            Success: false,
            Message: fmt.Sprintf("Object %s exists but update failed: %v", input.Name, err),
            Name:    input.Name,
        }, nil
    }

    // Activate after update
    activateResult, activateErr := h.apiClient.Activate(adtType, input.Name)
    activated := activateErr == nil && activateResult != nil && activateResult.Success

    return nil, OutputType{
        Success: true,
        Message: fmt.Sprintf("%s already existed — updated and %s",
            input.Name, activationStatusString(activated)),
        Name: input.Name,
    }, nil
}

// ... existing create path unchanged ...
```

Add helper function:
```go
func activationStatusString(activated bool) string {
    if activated {
        return "activated successfully"
    }
    return "saved (activation had errors)"
}
```

### What NOT to Change

- Do not modify `apiclient.go` — the API client is fine
- Do not add a new tool — modify existing `HandleCreateProgram` and `HandleCreateClass`
- Do not change the MCP tool registration in `registerTools()`

### Test

1. Using abaper-editor AI chat, create a class: `create class YCL_PHASE0_TEST with a simple method GET_VALUE that returns 42`
2. Verify it's created and activated in SAP
3. Prompt again: `create class YCL_PHASE0_TEST with method GET_VALUE that returns 99`
4. Verify the tool response says "already existed — updated" (not an error)
5. Check SAP — the class should now return 99

### Rollback

```bash
# Revert tools.go to previous commit
git revert HEAD
# Rebuild and push
docker build -t bdadevops/abaper-mcp:latest . && docker push bdadevops/abaper-mcp:latest
# Watchtower picks up within 5 minutes
```

### Risk

Low. Extra GET call adds ~0.5s per create. If the GET fails (network issue), it returns `nil` and falls through to the original create path — zero behavior change.

---

## 0.2 — Harden Abaper Agent System Prompt

### Goal

Make the LLM follow a disciplined create → validate → activate → retry workflow instead of ad-hoc behavior.

### Repo

`cai-llm-router` — Go

### Files to Modify

- `config/agents.yaml` — `agents.abaper.system_prompt` field

### Implementation

Replace the current `system_prompt` value for the `abaper` agent with:

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
      - syntax-check: Use proactively before activate if unsure about the code
      - run-unit-tests: Only after successful activation
```

Keep all other fields (`max_iterations`, `mcp_servers`, `timeout`, etc.) unchanged.

### Also Update on Server

The deployed `agents.yaml` on the apps node may be a stale volume mount. After pushing to the repo:

```bash
# SSH to apps node
ssh apps

# Copy updated config to the mounted volume
docker cp ~/src/cai-llm-router/config/agents.yaml cai-llm-router:/app/config/agents.yaml

# Restart to pick up changes
docker restart cai-llm-router
```

### Test

1. In abaper-editor, prompt: `create class YCL_PHASE0_PROMPT with a method that calls a non-existent function module`
2. The AI should:
   - Call `create-class`
   - Call `activate-object`
   - See activation failure (undefined function module)
   - Fix the code by removing the bad call
   - Call `update-class` then `activate-object` again
   - Report the final status accurately
3. Verify the response says "activated successfully" only if SAP actually confirmed activation

### Rollback

```bash
# Revert agents.yaml to previous version
git checkout HEAD~1 -- config/agents.yaml
# Restart container
docker restart cai-llm-router
```

### Risk

Low. Prompt-only change. The prompt is ~400 tokens — well within model limits. If the prompt is too prescriptive, the LLM may refuse edge cases — fixable by loosening language in a subsequent update.

---

## 0.3 — Structured Error Responses from MCP Tools

### Goal

Replace unstructured error strings with typed error fields so the LLM can reason about failures programmatically.

### Repo

`abaper-mcp` — Go

### Files to Modify

- `tools.go` — all Output structs and error return paths

### Implementation

Add `ErrorCode`, `ErrorDetail`, and `Errors` fields to every output struct that can fail:

```go
// Add to: CreateProgramOutput, CreateClassOutput, UpdateProgramOutput, UpdateClassOutput,
//         ActivateObjectOutput, RunUnitTestsOutput, SyntaxCheckOutput
ErrorCode   string   `json:"error_code,omitempty"`
ErrorDetail string   `json:"error_detail,omitempty"`
Errors      []string `json:"errors,omitempty"`
```

Error code enum (use as string constants in Go):

| Code | Meaning |
|------|---------|
| `ALREADY_EXISTS` | Object already exists (create attempted on existing) |
| `NOT_FOUND` | Object not found (update/activate on non-existent) |
| `SYNTAX_ERROR` | Syntax check found errors |
| `ACTIVATION_FAILED` | SAP activation returned errors |
| `SAP_ERROR` | Generic SAP/ADT error |
| `TIMEOUT` | Request timed out |

For each handler's error path, populate these fields. Example for `HandleActivateObject`:

```go
if !result.Success {
    var msgs []string
    for _, m := range result.Messages {
        msgs = append(msgs, fmt.Sprintf("[%s] %s", m.Severity, m.Text))
    }
    return nil, ActivateObjectOutput{
        Success:     false,
        Message:     "Activation failed",
        ErrorCode:   "ACTIVATION_FAILED",
        ErrorDetail: strings.Join(msgs, "; "),
        Errors:      msgs,
        ObjectName:  input.ObjectName,
        ObjectType:  input.ObjectType,
    }, nil
}
```

### What NOT to Change

- Do not change the tool registration or MCP schema — these are additive fields
- Do not change `apiclient.go` — errors are classified at the handler level
- Do not remove existing `Message` field — keep it for backward compatibility

### Test

1. Create a class with intentional ABAP syntax error via AI chat
2. Check the tool result JSON (visible in cai-llm-router debug logs)
3. Verify `error_code` is `"ACTIVATION_FAILED"` and `errors` is an array of specific messages
4. Verify the LLM references specific error messages in its retry attempt

### Rollback

Revert `tools.go`. New JSON fields are additive — consumers that don't read them are unaffected.

### Risk

None. Additive fields only. JSON serialization adds negligible overhead.

---

## 0.4 — Increase NATS Max Payload

### Goal

Prevent message rejection when large ABAP source code or LLM responses exceed the 1MB default.

### Service

NATS server on apps node

### Implementation

Update the NATS server configuration:

```bash
ssh apps

# Find NATS config
# Option A: Docker compose env
# Add to nats service environment:
#   command: ["--max_payload", "8388608"]

# Option B: nats-server.conf
# Add line:
#   max_payload: 8388608

# Restart NATS
docker restart nats
```

Verify:
```bash
# Check NATS server info
docker exec nats nats-server --signal ldm  # Dump info
# Or connect with nats CLI:
nats server info
```

### Test

1. Use AI to fetch a large SAP standard class: `get the source code for CL_GUI_ALV_GRID`
2. Verify the full source returns without truncation
3. Check NATS logs for any rejected messages: `docker logs nats 2>&1 | grep -i "payload\|reject\|exceed"`

### Rollback

```bash
# Remove the max_payload setting or set back to default
# Restart NATS
docker restart nats
```

### Risk

Low. 8MB * N concurrent messages = memory impact. With typical concurrency of <50 simultaneous requests, peak = 400MB. Monitor NATS memory after deployment.

---

## 0.5 — Switch abaper-mcp to Streamable HTTP Transport

### Goal

Replace legacy SSE transport between cai-llm-router and abaper-mcp with Streamable HTTP. Both services already support it — this is a config-only change.

### Background

**SSE (current)**: Long-lived HTTP connection, server pushes events. Designed for browser-to-server. Overhead of connection management, event stream parsing, reconnection logic.

**Streamable HTTP (recommended)**: Standard HTTP POST with streaming response body. Simpler, lower overhead, no connection state. The MCP 2025-03-26 spec transport.

Both services on the same Docker network on the same node — Streamable HTTP is strictly better here. No long-lived connections to manage, no SSE event formatting overhead.

### Implementation

Single env var change on abaper-mcp:

```bash
ssh apps

# Update abaper-mcp environment
# In the compose file or env file for abaper-mcp, change:
ABAPER_USE_LEGACY_SSE=false

# Restart abaper-mcp
docker restart abaper-mcp
```

cai-llm-router needs NO changes — it already uses `TransportAuto` which tries Streamable HTTP first (`/mcp` endpoint), then falls back to SSE (`/sse` endpoint).

After restart, cai-llm-router logs should show:
```
msg="Connected via Streamable HTTP transport" name=abaper-mcp url=http://abaper-mcp:8015/mcp
```

Instead of the current:
```
msg="Connected via SSE transport (fallback)" name=abaper-mcp url=http://abaper-mcp:8015/sse
```

### Test

1. Restart abaper-mcp with `ABAPER_USE_LEGACY_SSE=false`
2. Restart cai-llm-router (to re-establish MCP connection)
3. Check cai-llm-router logs: confirm `"Streamable HTTP"` transport
4. Send an AI chat prompt that uses tools: `get the source of ZCL_WEATHER_TIME`
5. Verify tools execute normally and response streams correctly

### Rollback

```bash
# Set back to SSE
ABAPER_USE_LEGACY_SSE=true
docker restart abaper-mcp
docker restart cai-llm-router
```

### Risk

Low. Both transports use the same MCP protocol — tool calls, results, and schemas are identical. Only the HTTP framing differs. If Streamable HTTP has issues, cai-llm-router's `TransportAuto` falls back to SSE automatically.
