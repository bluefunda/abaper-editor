# Phase RAG — Retrieval-Augmented Generation

## Agent Instructions

Independent of all existing phases. RAG is a horizontal layer that augments the existing agentic flow without replacing anything. Tiers are gated: implement RAG-0 first, then RAG-1 and RAG-2 only when gate criteria are met.

---

## Goal

Inject retrieved context (error history, code patterns, SAP metadata) into the LLM prompt before each call. The agent currently has zero domain knowledge — it follows system prompt rules and retries on activation errors, but guesses fixes from scratch every time. RAG bridges this gap.

## Architecture Overview

```
Tool fails → query RAG store → inject historical context → LLM retries with knowledge
```

Three tiers, each gated:

| Tier | Name | Store | When |
|------|------|-------|------|
| RAG-0 | Error Pattern Retrieval | NATS KV | Now |
| RAG-1 | Code Pattern Retrieval | MinIO | After RAG-0 proven |
| RAG-2 | SAP System Knowledge | PostgreSQL + pgvector | After RAG-1 proven |

---

# RAG-0 — Error Pattern Retrieval

## Goal

Store error→fix pairs in NATS KV. After tool failure, inject historical solutions into the next LLM message. Highest ROI — eliminates repeated guessing for the same activation errors across sessions.

## Repo

`cai-llm-router` — Go

## Files to Create

- `internal/rag/errors.go` — `ErrorPatternStore` wrapping NATS KV bucket `rag-error-patterns`

## Files to Modify

- `internal/handler/mcp_handler.go` — After tool failure (~line 177), query ErrorPatternStore for similar errors. If found, append system message with historical solutions.
- `internal/handler/chat.go` — Add `ragStore *rag.ErrorPatternStore` field to ChatHandler struct
- `cmd/server/main.go` — Initialize ErrorPatternStore with JetStream context (same pattern as ProfileManager at lines 142-167)
- `config/agents.yaml` — Add `retrieval.enabled: true` to abaper agent

## NATS KV Bucket Structure

```
Bucket: rag-error-patterns

Key format: normalized error signature
  e.g., ACTIVATION_FAILED:type_unknown:ZIF_*
        ACTIVATION_FAILED:syntax_error:METHODS_*

Value: JSON
  {
    "error": "Type ZIF_NONEXISTENT is unknown",
    "solution": "Changed ZIF_NONEXISTENT to ZIF_ACTUAL_TYPE",
    "source_artifact": "ZCL_MY_CLASS",
    "timestamp": "2026-02-25T10:30:00Z",
    "hit_count": 3
  }
```

## ErrorPatternStore Implementation

```go
package rag

import (
    "context"
    "encoding/json"
    "fmt"
    "strings"
    "time"

    "github.com/nats-io/nats.go/jetstream"
    "github.com/rs/zerolog/log"
)

type ErrorPattern struct {
    Error          string    `json:"error"`
    Solution       string    `json:"solution"`
    SourceArtifact string    `json:"source_artifact"`
    Timestamp      time.Time `json:"timestamp"`
    HitCount       int       `json:"hit_count"`
}

type ErrorPatternStore struct {
    kv jetstream.KeyValue
}

func NewErrorPatternStore(js jetstream.JetStream) (*ErrorPatternStore, error) {
    kv, err := js.CreateOrUpdateKeyValue(context.Background(), jetstream.KeyValueConfig{
        Bucket:  "rag-error-patterns",
        History: 5,
    })
    if err != nil {
        return nil, fmt.Errorf("create rag-error-patterns bucket: %w", err)
    }
    return &ErrorPatternStore{kv: kv}, nil
}

// NormalizeErrorKey extracts a stable signature from an activation error.
// e.g., "Type ZIF_FOO is unknown" → "ACTIVATION_FAILED:type_unknown:ZIF_*"
func NormalizeErrorKey(errorCode, errorMsg string) string {
    msg := strings.ToUpper(errorMsg)
    switch {
    case strings.Contains(msg, "IS UNKNOWN"):
        return fmt.Sprintf("%s:type_unknown", errorCode)
    case strings.Contains(msg, "SYNTAX ERROR"):
        return fmt.Sprintf("%s:syntax_error", errorCode)
    case strings.Contains(msg, "ALREADY EXISTS"):
        return fmt.Sprintf("%s:already_exists", errorCode)
    default:
        return fmt.Sprintf("%s:other", errorCode)
    }
}

// Store saves an error→fix pair after a successful retry.
func (s *ErrorPatternStore) Store(ctx context.Context, key string, pattern ErrorPattern) error {
    // Check if pattern exists — increment hit_count
    existing, err := s.kv.Get(ctx, key)
    if err == nil {
        var ep ErrorPattern
        if json.Unmarshal(existing.Value(), &ep) == nil {
            pattern.HitCount = ep.HitCount + 1
        }
    }

    data, err := json.Marshal(pattern)
    if err != nil {
        return fmt.Errorf("marshal pattern: %w", err)
    }
    _, err = s.kv.Put(ctx, key, data)
    return err
}

// Retrieve returns up to maxResults matching patterns for the given error.
func (s *ErrorPatternStore) Retrieve(ctx context.Context, errorCode, errorMsg string, maxResults int) []ErrorPattern {
    key := NormalizeErrorKey(errorCode, errorMsg)
    entry, err := s.kv.Get(ctx, key)
    if err != nil {
        return nil
    }

    var pattern ErrorPattern
    if err := json.Unmarshal(entry.Value(), &pattern); err != nil {
        log.Warn().Err(err).Str("key", key).Msg("Failed to unmarshal error pattern")
        return nil
    }

    pattern.HitCount++
    // Update hit count asynchronously
    if data, err := json.Marshal(pattern); err == nil {
        s.kv.Put(ctx, key, data)
    }

    return []ErrorPattern{pattern}
}
```

## Integration Point — mcp_handler.go

After tool failure in the agentic loop:

```go
// After tool call returns an error (line ~177 in mcp_handler.go)
if toolResult.IsError && h.ragStore != nil {
    patterns := h.ragStore.Retrieve(ctx, errorCode, errorMsg, 3)
    if len(patterns) > 0 {
        var hints []string
        for _, p := range patterns {
            hints = append(hints, fmt.Sprintf("- Error: %s → Fix: %s (seen %d times)",
                p.Error, p.Solution, p.HitCount))
        }
        ragContext := fmt.Sprintf(
            "Historical solutions for this error:\n%s\nUse these as guidance — adapt to the current context.",
            strings.Join(hints, "\n"),
        )
        // Append as system message before next LLM call
        messages = append(messages, openai.SystemMessage(ragContext))
    }
}

// Auto-populate: after successful retry (tool failed → LLM fixed → tool succeeded)
if !toolResult.IsError && previousToolFailed {
    // Extract what the LLM changed between attempts
    h.ragStore.Store(ctx, errorKey, rag.ErrorPattern{
        Error:          previousError,
        Solution:       extractDiff(previousSource, currentSource),
        SourceArtifact: artifactName,
        Timestamp:      time.Now(),
    })
}
```

## Initialization — cmd/server/main.go

```go
// After JetStream init (same pattern as ProfileManager)
errorStore, err := rag.NewErrorPatternStore(js)
if err != nil {
    log.Fatal().Err(err).Msg("Failed to create error pattern store")
}
chatHandler.SetRAGStore(errorStore)
```

## Test Scenarios

### Auto-populate on successful retry
1. Prompt: `create class ZCL_RAG_TEST with method that uses TYPE nonexistent_type`
2. Verify: first call fails with `ACTIVATION_FAILED`, LLM fixes the type
3. Verify: after successful retry, check NATS KV for new entry:
   ```bash
   nats kv get rag-error-patterns ACTIVATION_FAILED:type_unknown
   ```
4. Verify: JSON contains the error and solution

### Retrieve on repeated error
5. Start a new chat session
6. Prompt: `create class ZCL_RAG_TEST2 with method that uses TYPE nonexistent_type`
7. Verify in cai-llm-router logs: "Historical solutions for this error" message injected
8. Verify: LLM fixes on first retry (instead of guessing)

### Hit count tracking
9. Repeat the same error pattern 3 times across different sessions
10. Verify: `hit_count` in NATS KV increments each time

## Rollback

1. Remove `internal/rag/errors.go`
2. Remove RAG query/store calls from `mcp_handler.go`
3. Remove `ragStore` field from `chat.go`
4. Remove initialization from `cmd/server/main.go`
5. KV bucket can be left in place or deleted: `nats kv rm rag-error-patterns`

The agentic loop continues to work — LLM just retries without historical context (same as today).

## Risk

| Risk | Mitigation |
|------|------------|
| Stale patterns | Patterns include timestamps. Add TTL or periodic cleanup if needed. |
| Wrong solutions injected | Solutions are "guidance" not instructions. LLM adapts to current context. |
| KV unavailable | Retrieve returns empty — agentic loop proceeds without RAG. No hard dependency. |
| Key collision | Normalized keys are coarse by design. Fine-grained keys can be added later. |

## Impact

| Metric | Value |
|--------|-------|
| **Latency** | +1-3ms per tool failure (NATS KV read). Zero impact on happy path. |
| **Ops complexity** | Low — auto-created bucket, no manual seeding required. Self-populating. |
| **Observability** | Log RAG hits/misses. `hit_count` shows pattern frequency. KV history for audit. |
| **Failure modes** | NATS KV unavailable → no RAG context injected, loop proceeds normally. Invalid JSON in KV → logged and skipped. |

---

# RAG-1 — Code Pattern Retrieval

## Gate Criteria

RAG-0 proven useful. Agent still generates incorrect ABAP structure on first attempt for common patterns (e.g., wrong class skeleton, missing interface implementation boilerplate).

## Goal

Store curated ABAP code examples in MinIO. Before `create-and-activate`, retrieve similar patterns by object type + keyword match (BM25). Inject top 2 patterns as context before the first LLM call in the agentic loop.

## Repo

`cai-llm-router` — Go

## Files to Create

- `internal/rag/patterns.go` — `CodePatternStore` backed by MinIO

## Files to Modify

- `internal/handler/mcp_handler.go` — Before first LLM call in agentic loop, query CodePatternStore
- `internal/storage/s3.go` — Add helper methods for pattern CRUD

## MinIO Storage Structure

```
Bucket: rag-patterns

Path: rag-patterns/{object_type}/{pattern_name}.json

Example:
  rag-patterns/CLAS/singleton_class.json
  rag-patterns/CLAS/factory_method.json
  rag-patterns/INTF/simple_interface.json
  rag-patterns/PROG/alv_report.json
```

## Pattern Format

```json
{
    "name": "singleton_class",
    "object_type": "CLAS",
    "description": "Thread-safe singleton pattern with lazy initialization",
    "tags": ["singleton", "design-pattern", "lazy-init"],
    "source_code": "CLASS zcl_singleton DEFINITION PUBLIC FINAL CREATE PRIVATE.\n  PUBLIC SECTION.\n    CLASS-METHODS get_instance RETURNING VALUE(ro_instance) TYPE REF TO zcl_singleton.\n  PRIVATE SECTION.\n    CLASS-DATA go_instance TYPE REF TO zcl_singleton.\nENDCLASS.\n\nCLASS zcl_singleton IMPLEMENTATION.\n  METHOD get_instance.\n    IF go_instance IS NOT BOUND.\n      CREATE OBJECT go_instance.\n    ENDIF.\n    ro_instance = go_instance.\n  ENDMETHOD.\nENDCLASS.",
    "created_at": "2026-02-25T10:00:00Z"
}
```

## Retrieval Logic

```go
// Keyword match on description + tags (no embeddings needed at this scale)
func (s *CodePatternStore) Retrieve(ctx context.Context, objectType, prompt string, maxResults int) []CodePattern {
    // List all patterns for the object type
    patterns := s.listByType(ctx, objectType)

    // Score by keyword overlap between prompt and (description + tags)
    scored := make([]scoredPattern, 0, len(patterns))
    promptTokens := tokenize(prompt)
    for _, p := range patterns {
        score := bm25Score(promptTokens, p.Description, p.Tags)
        if score > 0 {
            scored = append(scored, scoredPattern{pattern: p, score: score})
        }
    }

    // Sort by score descending, return top N
    sort.Slice(scored, func(i, j int) bool { return scored[i].score > scored[j].score })
    if len(scored) > maxResults {
        scored = scored[:maxResults]
    }

    result := make([]CodePattern, len(scored))
    for i, s := range scored {
        result[i] = s.pattern
    }
    return result
}
```

## Integration — mcp_handler.go

Before the first LLM call when `create-and-activate` is the likely tool:

```go
// Inject code patterns before first LLM call
if h.patternStore != nil && isCreationPrompt(userMessage) {
    objectType := detectObjectType(userMessage) // "CLAS", "PROG", etc.
    patterns := h.patternStore.Retrieve(ctx, objectType, userMessage, 2)
    if len(patterns) > 0 {
        var examples []string
        for _, p := range patterns {
            examples = append(examples, fmt.Sprintf("### %s\n%s\n```abap\n%s\n```",
                p.Name, p.Description, p.SourceCode))
        }
        ragContext := fmt.Sprintf(
            "Reference ABAP patterns for this object type:\n%s\nAdapt these patterns to the user's request — do not copy verbatim.",
            strings.Join(examples, "\n\n"),
        )
        messages = append([]openai.ChatCompletionMessage{openai.SystemMessage(ragContext)}, messages...)
    }
}
```

## Seeding Patterns

```bash
# Upload patterns to MinIO via mc CLI
mc cp singleton_class.json minio/rag-patterns/CLAS/singleton_class.json
mc cp factory_method.json minio/rag-patterns/CLAS/factory_method.json
mc cp simple_interface.json minio/rag-patterns/INTF/simple_interface.json
mc cp alv_report.json minio/rag-patterns/PROG/alv_report.json

# List all patterns
mc ls minio/rag-patterns/ --recursive
```

## Test Scenarios

### Pattern retrieval
1. Seed 3-5 ABAP patterns into MinIO
2. Prompt: `create a singleton class ZCL_MY_SINGLETON`
3. Verify in logs: "Reference ABAP patterns" injected with singleton pattern
4. Verify: LLM generates correct singleton structure on first attempt

### No match
5. Prompt: `create a simple hello world program`
6. With no matching patterns, verify: no RAG context injected, normal behavior

## Rollback

1. Remove `internal/rag/patterns.go`
2. Remove pattern query from `mcp_handler.go`
3. Remove helper methods from `internal/storage/s3.go`
4. MinIO bucket can be left in place or deleted

## Impact

| Metric | Value |
|--------|-------|
| **Latency** | +10-50ms per creation request (MinIO list + read). Cached in memory after first load. |
| **Ops complexity** | Medium — requires curating and uploading pattern files. |
| **Observability** | Log which patterns matched and their scores. Track first-attempt success rate. |
| **Failure modes** | MinIO unavailable → no patterns injected, normal behavior. Empty bucket → no-op. |

---

# RAG-2 — SAP System Knowledge via XPro

## Gate Criteria

RAG-1 proven useful. Agent still fails on type resolution and API discovery — asks for types/interfaces/RFCs that don't exist in the connected SAP system.

## Goal

Use XPro (`/Users/phani/Downloads/src/xpro`) for daily metadata sync from SAP into a searchable store. Provide the agent with real-time awareness of what exists in the SAP system.

## XPro Integration Architecture

XPro is an existing XML/JSON processing engine with:
- **Daemon mode**: listens on NATS for trigger messages
- **File watcher**: monitors MinIO for new XML files
- **PostgreSQL output**: writes structured data to tables
- **NATS JetStream**: reliable message processing with 90-day retention

### Daily Sync Flow

```
SAP System → ADT/RFC XML export → MinIO (staging)
    ↓
XPro file-watcher detects new XML → processor parses metadata
    ↓
Structured output → PostgreSQL (indexed) + NATS KV (hot cache)
```

### What Gets Synced

| Data | Source | Frequency |
|------|--------|-----------|
| Type dictionary (data elements, structures, table types) | SE11 via ADT | Daily |
| Class/interface catalog (public methods + signatures) | SE24 via ADT | Daily |
| RFC module directory (function modules + parameters) | SE37 via ADT | Daily |
| OData service metadata (entities, properties, labels) | `cai-xml-odata` parser | On service registration |

### Storage Tiers

| Data | Hot Cache (NATS KV) | Cold Store (PostgreSQL) |
|------|---------------------|------------------------|
| Type definitions | Top 500 most-referenced types | Full dictionary |
| Class interfaces | Active project classes | All Z* custom classes |
| Error patterns | All (from RAG-0) | Historical archive |
| OData metadata | Active services | All registered services |

### XPro Config Addition

```yaml
# xpro/config.yml
processors:
  sap-metadata:
    input: minio://sap-metadata-xml/
    output: postgres://rag_sap_metadata
    schedule: "0 2 * * *"  # daily 2 AM
    format: xml
    parser: sap-adt-metadata
```

### Query Path from cai-llm-router

```
Agent needs type info → NATS KV hot cache (sub-ms)
    ↓ cache miss
PostgreSQL query (5-10ms)
    ↓
Inject into LLM context: "Available types matching your query: [results]"
```

## Vector DB: Benefits vs Over-Engineering

### Why NOT to add a vector DB for RAG-0 and RAG-1

- Current corpus is small (~500-2000 ABAP objects per system)
- BM25/keyword search handles error patterns and code patterns at this scale
- Adds infra dependency (deploy, monitor, backup)
- Embedding model adds +200-500ms latency and API cost per query
- NATS KV + MinIO already deployed and sufficient

### When a vector DB becomes justified (RAG-2 gate criteria)

- Corpus exceeds 10K documents (full SAP system metadata via XPro sync)
- Keyword search returns too many false positives (semantic search needed)
- Cross-language retrieval needed (ABAP keywords → English documentation)
- Agent needs to discover "similar" code, not just exact keyword matches

### Recommended path when gated

- **pgvector** (first choice) — PostgreSQL is already used by XPro. Add `CREATE EXTENSION vector;` — zero new infra. Store embeddings alongside XPro metadata tables.
- **Qdrant** (if dedicated search needed) — lightweight single binary, good Go SDK, docker-friendly. Use when pgvector query performance is insufficient.
- NOT Milvus/Pinecone — over-scaled for this use case.

### Embedding model options

- **OpenAI `text-embedding-3-small`** (128D, $0.02/1M tokens) — simplest, already have API key
- **Local `all-MiniLM-L6-v2`** (384D, free) — runs on apps node, no API dependency
- Recommendation: Start with OpenAI embeddings, switch to local if cost/latency matters

### Verdict

Vector DB is over-engineering for RAG-0 and RAG-1. **pgvector on XPro's existing PostgreSQL** is the natural path for RAG-2 — zero new infra, XPro already writes there. Same gating philosophy as Phase 2 (Temporal) and Phase 4 (Object Store).

## Rollback

1. Stop XPro sap-metadata processor
2. Remove NATS KV hot cache entries
3. PostgreSQL tables can be left in place or dropped
4. cai-llm-router falls back to RAG-0/RAG-1 context only

## Impact

| Metric | Value |
|--------|-------|
| **Latency** | Hot cache: sub-ms. Cold query: 5-10ms. Embedding search (pgvector): 10-50ms. |
| **Ops complexity** | High — requires SAP ADT export pipeline, XPro config, PostgreSQL schema, daily cron. |
| **Observability** | Sync job metrics (records synced, errors, duration). Cache hit/miss ratio. Query latency. |
| **Failure modes** | XPro sync fails → stale data in cache (last successful sync). NATS KV miss → PostgreSQL fallback. PostgreSQL down → no SAP metadata, agent proceeds without it. |
