# Phase 1 — Controlled Retry Loop

## Agent Instructions

Depends on Phase 0.1 (idempotency) and Phase 0.3 (structured errors). Deploy those first.

---

## Goal

Add a `create-and-activate` composite tool to abaper-mcp that wraps the create → activate flow with structured error feedback. The tool handles mechanical plumbing (existence check, create vs update, activation). The LLM handles intelligence (fixing syntax errors, adjusting code).

## Why Not Internal Retry?

The tool cannot fix ABAP syntax — only the LLM can. So the tool does ONE attempt (create + activate), returns structured errors, and the LLM calls the tool again with corrected source. The agent's `max_iterations: 25` bounds total attempts.

## Repo

`abaper-mcp` — Go

## Files to Modify

- `tools.go` — add new input/output types and handler
- `main.go` (or `tools.go` at `registerTools`) — register the new tool

## New Types

Add to `tools.go`:

```go
// CreateAndActivateInput defines input for create-and-activate composite tool
type CreateAndActivateInput struct {
    ObjectType  string `json:"object_type" jsonschema:"Type: program or class"`
    Name        string `json:"name" jsonschema:"Object name (e.g., ZCL_MY_CLASS)"`
    Description string `json:"description,omitempty" jsonschema:"Object description (required for new objects)"`
    Package     string `json:"package,omitempty" jsonschema:"Package name (default: $TMP)"`
    SourceCode  string `json:"source_code" jsonschema:"Complete ABAP source code"`
}

// CreateAndActivateOutput defines output for create-and-activate composite tool
type CreateAndActivateOutput struct {
    Success   bool            `json:"success"`
    Message   string          `json:"message"`
    Name      string          `json:"name"`
    Action    string          `json:"action"`     // "created", "updated"
    Activated bool            `json:"activated"`
    ErrorCode string          `json:"error_code,omitempty"`
    Errors    []string        `json:"errors,omitempty"`
    Steps     []StepRecord    `json:"steps"`
}

// StepRecord records one step in the create-and-activate flow
type StepRecord struct {
    Step    string   `json:"step"`     // "existence_check", "create", "update", "activate"
    Success bool     `json:"success"`
    Detail  string   `json:"detail,omitempty"`
    Errors  []string `json:"errors,omitempty"`
}
```

## Handler Implementation

```go
func (h *Handlers) HandleCreateAndActivate(ctx context.Context, req *mcp.CallToolRequest, input CreateAndActivateInput) (*mcp.CallToolResult, CreateAndActivateOutput, error) {
    requestID := uuid.New().String()[:8]
    start := time.Now()
    log := logger.WithTool(requestID, "create-and-activate")

    adtType := normalizeObjectType(input.ObjectType)
    pkg := input.Package
    if pkg == "" {
        pkg = "$TMP"
    }

    var steps []StepRecord
    action := "created"

    // Step 1: Check existence
    existing, _ := h.apiClient.GetObject(adtType, input.Name, "")
    steps = append(steps, StepRecord{
        Step:    "existence_check",
        Success: true,
        Detail:  fmt.Sprintf("exists=%v", existing != nil && existing.Source != ""),
    })

    // Step 2: Create or Update
    if existing != nil && existing.Source != "" {
        action = "updated"
        err := h.apiClient.UpdateObject(adtType, input.Name, input.SourceCode)
        if err != nil {
            steps = append(steps, StepRecord{Step: "update", Success: false, Detail: err.Error()})
            return nil, CreateAndActivateOutput{
                Success:   false,
                Message:   fmt.Sprintf("Failed to update %s: %v", input.Name, err),
                Name:      input.Name,
                Action:    action,
                ErrorCode: "SAP_ERROR",
                Steps:     steps,
            }, nil
        }
        steps = append(steps, StepRecord{Step: "update", Success: true})
    } else {
        if input.Description == "" {
            input.Description = input.Name
        }
        err := h.apiClient.CreateObject(adtType, input.Name, input.Description, input.SourceCode, pkg)
        if err != nil {
            errMsg := err.Error()
            errorCode := "SAP_ERROR"
            if strings.Contains(errMsg, "already exists") {
                errorCode = "ALREADY_EXISTS"
            }
            steps = append(steps, StepRecord{Step: "create", Success: false, Detail: errMsg})
            return nil, CreateAndActivateOutput{
                Success:   false,
                Message:   fmt.Sprintf("Failed to create %s: %v", input.Name, err),
                Name:      input.Name,
                Action:    action,
                ErrorCode: errorCode,
                Steps:     steps,
            }, nil
        }
        steps = append(steps, StepRecord{Step: "create", Success: true})
    }

    // Step 3: Activate
    activateResult, activateErr := h.apiClient.Activate(adtType, input.Name)
    if activateErr != nil {
        steps = append(steps, StepRecord{Step: "activate", Success: false, Detail: activateErr.Error()})
        return nil, CreateAndActivateOutput{
            Success:   false,
            Message:   fmt.Sprintf("%s %s but activation call failed: %v", input.Name, action, activateErr),
            Name:      input.Name,
            Action:    action,
            Activated: false,
            ErrorCode: "SAP_ERROR",
            Steps:     steps,
        }, nil
    }

    if !activateResult.Success {
        var errorMsgs []string
        for _, m := range activateResult.Messages {
            errorMsgs = append(errorMsgs, fmt.Sprintf("[%s] %s", m.Severity, m.Text))
        }
        steps = append(steps, StepRecord{Step: "activate", Success: false, Errors: errorMsgs})
        return nil, CreateAndActivateOutput{
            Success:   false,
            Message:   fmt.Sprintf("%s %s but activation failed. Fix the errors and call this tool again with corrected source_code.", input.Name, action),
            Name:      input.Name,
            Action:    action,
            Activated: false,
            ErrorCode: "ACTIVATION_FAILED",
            Errors:    errorMsgs,
            Steps:     steps,
        }, nil
    }

    steps = append(steps, StepRecord{Step: "activate", Success: true})

    log.Info("create-and-activate completed",
        zap.String("name", input.Name),
        zap.String("action", action),
        zap.Bool("activated", true),
        zap.Duration("duration", time.Since(start)),
    )

    return nil, CreateAndActivateOutput{
        Success:   true,
        Message:   fmt.Sprintf("%s %s and activated successfully", input.Name, action),
        Name:      input.Name,
        Action:    action,
        Activated: true,
        Steps:     steps,
    }, nil
}
```

## Tool Registration

In `registerTools()`:

```go
mcp.AddTool(server, &mcp.Tool{
    Name:        "create-and-activate",
    Description: "Create or update an ABAP object and activate it. Checks existence first (idempotent). Returns structured errors for activation failures — fix the source and call again.",
}, handlers.HandleCreateAndActivate)
```

## System Prompt Update

Update the abaper agent system prompt in `cai-llm-router/config/agents.yaml` to prefer `create-and-activate` over separate `create-class` + `activate-object`:

```yaml
## Tool Usage
- create-and-activate: PREFERRED for all object creation. Handles existence check, create/update, and activation in one call. Returns structured errors if activation fails.
- create-class/create-program: Only use if you need to create WITHOUT activating (rare).
- update-class/update-program: Only use if you need to update WITHOUT activating (rare).
- activate-object: Only use if you need to activate a previously saved object.
```

## Test Scenarios

### Happy path
1. Prompt: `create class YCL_PHASE1_TEST with method GET_VALUE returning string value "hello"`
2. Verify: tool returns `action: "created"`, `activated: true`, `steps` shows all 3 steps succeeded

### Idempotent update
3. Prompt same again: `create class YCL_PHASE1_TEST with method GET_VALUE returning "world"`
4. Verify: tool returns `action: "updated"`, `activated: true`

### Syntax error and retry
5. Prompt: `create class YCL_PHASE1_BROKEN with this source: CLASS ycl_phase1_broken DEFINITION PUBLIC. PUBLIC SECTION. METHODS bad_method IMPORTING iv_x TYPE nonexistent_type. ENDCLASS.`
6. Verify: tool returns `activated: false`, `error_code: "ACTIVATION_FAILED"`, `errors` array contains the specific error
7. Verify: the LLM reads the errors, fixes the type reference, and calls `create-and-activate` again
8. Verify: second attempt succeeds with `activated: true`

### Failure simulation
9. Stop abaper-ts: `docker stop abaper-ts`
10. Prompt: `create class YCL_PHASE1_DOWN with a simple method`
11. Verify: tool returns `error_code: "SAP_ERROR"` with timeout message
12. Restart abaper-ts: `docker start abaper-ts`

## Rollback

1. Remove the `create-and-activate` tool registration from `registerTools()`
2. Remove the handler and types from `tools.go`
3. Revert the system prompt to reference `create-class` + `activate-object` separately
4. Rebuild and push abaper-mcp image

The original `create-class`, `create-program`, and `activate-object` tools are untouched — they still work.

## Impact

| Metric | Value |
|--------|-------|
| **Latency** | ~Same as separate calls. One tool call instead of 2-3, but same underlying HTTP calls. |
| **Ops complexity** | None — single Go handler in existing codebase |
| **Observability** | `steps` array gives full audit trail per artifact creation |
| **Failure modes** | Same as today but more explicit. If abaper-ts is down, errors are immediate. No infinite retry — bounded by `max_iterations`. |
