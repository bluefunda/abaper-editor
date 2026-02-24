# Phase 2 — Temporal Orchestration (Gated)

## Agent Instructions

This phase is GATED. Only implement if Phase 1 proves insufficient for complex multi-artifact prompts (5+ artifacts with dependencies). Verify the gate criteria below before proceeding.

---

## Gate Criteria

Implement this phase ONLY when ALL of these are true:
- Users regularly issue multi-artifact prompts (e.g., "create OData service" = 5-10 artifacts)
- Phase 1's per-tool retry is insufficient because inter-artifact dependencies cause cascading failures
- There is a demonstrated need to resume workflows after partial failure (e.g., container restart mid-creation)
- The LLM's agent loop (`max_iterations: 25`) is insufficient for complex artifact chains

## Goal

Enhance the existing `AbaperWorkflow` in cai-llm-router to support a plan → execute pattern where the LLM generates an artifact plan and Temporal orchestrates sequential/parallel execution with per-activity retry.

## Repo

`cai-llm-router` — Go

## Current State

`AbaperWorkflow` already exists in `internal/temporal/abaper_workflow.go`:
- 30-minute timeout, 60-second heartbeat
- 2 retry attempts
- Single activity: `ProcessAbaperChat`
- Worker registered in `internal/temporal/worker.go`

## Files to Modify

- `internal/temporal/abaper_workflow.go` — enhance workflow with plan-execute pattern
- `internal/temporal/activities.go` — add `PlanArtifacts` and `CreateArtifact` activities
- `internal/temporal/worker.go` — register new activities
- `internal/handler/mcp_handler.go` — detect multi-artifact requests and route to enhanced workflow

## Architecture

```
User prompt: "Create OData service for customer data"
    │
    ▼
AbaperWorkflow (Temporal)
    │
    ├── Activity: PlanArtifacts
    │     LLM call with JSON output constraint
    │     Returns: [{type: "TABL", name: "ZCUSTOMER", depends_on: []},
    │               {type: "CLAS", name: "ZCL_CUSTOMER_DPC", depends_on: ["ZCUSTOMER"]},
    │               ...]
    │
    ├── Activity: CreateArtifact("ZCUSTOMER")
    │     Calls abaper-mcp create-and-activate tool
    │     Retry: 2 attempts, fixed 2s backoff
    │
    ├── Activity: CreateArtifact("ZCL_CUSTOMER_DPC")  ← only after ZCUSTOMER succeeds
    │     ...
    │
    └── StreamResult (SSE to client)
          Artifact-by-artifact progress updates
```

## Key Types

```go
type ArtifactPlan struct {
    Artifacts []PlannedArtifact `json:"artifacts"`
}

type PlannedArtifact struct {
    Type        string   `json:"type"`         // "CLAS", "PROG", "TABL", etc.
    Name        string   `json:"name"`
    Description string   `json:"description"`
    DependsOn   []string `json:"depends_on"`   // Names of prerequisite artifacts
    Source      string   `json:"source"`
    Package     string   `json:"package"`
}

type ArtifactResult struct {
    Name      string `json:"name"`
    Type      string `json:"type"`
    Action    string `json:"action"`    // "created", "updated", "failed"
    Activated bool   `json:"activated"`
    Error     string `json:"error,omitempty"`
}
```

## Activity Boundaries

| Activity | Timeout | Retries | Backoff |
|----------|---------|---------|---------|
| `PlanArtifacts` | 60s | 1 | None |
| `ValidatePlan` | 5s | 0 | None |
| `CreateArtifact` | 120s | 2 | Fixed 2s |

## Workflow Logic (Pseudocode)

```go
func AbaperMultiArtifactWorkflow(ctx workflow.Context, input ChatWorkflowInput) (*ChatWorkflowResult, error) {
    // Step 1: Plan
    var plan ArtifactPlan
    err := workflow.ExecuteActivity(ctx, activities.PlanArtifacts, input).Get(ctx, &plan)
    if err != nil {
        return nil, err
    }

    // Step 2: Validate (cycle detection, name validation)
    err = workflow.ExecuteActivity(ctx, activities.ValidatePlan, plan).Get(ctx, nil)
    if err != nil {
        return nil, err
    }

    // Step 3: Execute in dependency order
    completed := map[string]bool{}
    results := []ArtifactResult{}

    for len(completed) < len(plan.Artifacts) {
        // Find artifacts whose dependencies are all completed
        ready := findReady(plan.Artifacts, completed)
        if len(ready) == 0 {
            break // Deadlock — remaining artifacts have unmet dependencies
        }

        // Execute ready artifacts (could be parallel if independent)
        for _, artifact := range ready {
            var result ArtifactResult
            err := workflow.ExecuteActivity(ctx, activities.CreateArtifact, artifact).Get(ctx, &result)
            results = append(results, result)
            if err != nil || !result.Activated {
                // Mark as failed but continue with independent artifacts
                completed[artifact.Name] = false
            } else {
                completed[artifact.Name] = true
            }
        }
    }

    return &ChatWorkflowResult{Artifacts: results}, nil
}
```

## Resume Semantics

Temporal handles this natively:
- Each completed `CreateArtifact` activity is persisted in workflow history
- On cai-llm-router restart, the Temporal worker picks up in-progress workflows
- Completed activities are replayed from history (not re-executed)
- `CreateArtifact` is idempotent (via Phase 0.1) — safe to retry

## Routing Decision

In `mcp_handler.go`, detect multi-artifact prompts:

```go
// Heuristic: if the system prompt mentions "OData", "multiple", or the plan prompt
// suggests multiple artifacts, route to the multi-artifact workflow.
// Initially: make this opt-in via a flag in the chat request.
```

Simpler approach: add a `workflow` field to the chat request that the frontend can set:
```json
{"prompt": "create OData service...", "workflow": "multi_artifact"}
```

This avoids unreliable heuristics and lets the user control when to use the enhanced workflow.

## Manual Replay Testing

```bash
# 1. Send a multi-artifact prompt via abaper-editor

# 2. While artifacts are being created, kill cai-llm-router
ssh apps
docker stop cai-llm-router

# 3. Check Temporal: workflow should be "Running" with N completed activities
temporal workflow describe -w <workflow-id> --namespace default

# 4. Restart cai-llm-router
docker start cai-llm-router

# 5. Temporal worker picks up the workflow, resumes from next activity
# Verify: only remaining artifacts are created (check cai-llm-router logs)

# 6. Verify in SAP: all artifacts exist and are activated
```

## Rollback

1. Revert `abaper_workflow.go` to the single-activity version
2. Remove new activities from `activities.go` and `worker.go`
3. Rebuild and push cai-llm-router
4. Terminate any in-flight multi-artifact workflows:
   ```bash
   temporal workflow terminate -w <id> --reason "Rollback"
   ```

The standard `AbaperWorkflow` (single `ProcessAbaperChat` activity) continues to work for all requests.

## Impact

| Metric | Value |
|--------|-------|
| **Latency** | +2-5s for plan generation step. Per-artifact: same as Phase 1. |
| **Ops complexity** | Medium — Temporal UI needed for monitoring. Already running. |
| **Observability** | Full workflow history in Temporal UI. Per-activity timing, retry counts, input/output visible. |
| **Failure modes** | Plan generation may produce invalid dependency order → `ValidatePlan` catches cycles. Temporal server down → workflow fails, retry on recovery. Stale workflows after rollback → manual `temporal workflow terminate`. |
