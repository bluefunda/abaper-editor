# Phase 4 — Large Payload Strategy

## Agent Instructions

Stage 1 (NATS max_payload) is already covered in Phase 0.4. This file covers Stage 2 (NATS Object Store) — implement only if Stage 1 proves insufficient.

---

## Gate Criteria

Implement Stage 2 ONLY when:
- NATS message rejections are observed in logs after Phase 0.4 (8MB limit)
- Specific use cases generate payloads >8MB (e.g., fetching entire SAP standard class hierarchies)
- Monitor with: `docker logs nats 2>&1 | grep -i "payload\|reject\|exceed"`

---

## Stage 2: NATS Object Store

### Goal

Offload large payloads (>4MB) to NATS Object Store (built into JetStream — no new infrastructure). Publish a reference via NATS instead of the payload itself.

### Repos

- `cai-llm-router` — Go (publisher: store large payloads)
- `cai-bff` — Go (consumer: resolve references)

### How NATS Object Store Works

NATS JetStream includes an Object Store API that stores arbitrarily large blobs:
- Chunked storage (128KB chunks by default)
- Get/Put by key name
- TTL support (auto-expiration)
- No new infrastructure — uses existing NATS JetStream

### Implementation: cai-llm-router (Publisher)

**File**: `internal/nats/client.go`

Add payload-aware publish:

```go
const largePayloadThreshold = 4 * 1024 * 1024 // 4 MB

// PayloadReference sent via NATS when payload is stored in Object Store
type PayloadReference struct {
    Type string `json:"_payload_ref"`  // "nats_object_store"
    Key  string `json:"key"`
    Size int    `json:"size"`
}

func (c *Client) PublishWithLargePayloadSupport(subject string, data []byte) error {
    if len(data) <= largePayloadThreshold {
        return c.nc.Publish(subject, data)
    }

    // Store in Object Store
    key := fmt.Sprintf("payload-%s-%d", uuid.New().String()[:8], time.Now().UnixMilli())
    _, err := c.objectStore.PutBytes(key, data)
    if err != nil {
        return fmt.Errorf("failed to store large payload: %w", err)
    }

    // Publish reference
    ref := PayloadReference{
        Type: "nats_object_store",
        Key:  key,
        Size: len(data),
    }
    refBytes, _ := json.Marshal(ref)
    return c.nc.Publish(subject, refBytes)
}
```

Object Store initialization (in client setup):

```go
func (c *Client) initObjectStore() error {
    js, err := jetstream.New(c.nc)
    if err != nil {
        return err
    }

    store, err := js.CreateOrUpdateObjectStore(context.Background(), jetstream.ObjectStoreConfig{
        Bucket:  "cai-payloads",
        TTL:     1 * time.Hour,    // Auto-expire after 1 hour
        MaxBytes: 1 * 1024 * 1024 * 1024, // 1 GB max
    })
    if err != nil {
        return err
    }
    c.objectStore = store
    return nil
}
```

### Implementation: cai-bff (Consumer)

**File**: `internal/nats/client/client.go`

In the event handler callback, detect and resolve references:

```go
func (c *Client) resolvePayload(data []byte) ([]byte, error) {
    // Quick check: does it look like a reference?
    if !bytes.Contains(data, []byte(`"_payload_ref"`)) {
        return data, nil // Not a reference, return as-is
    }

    var ref PayloadReference
    if err := json.Unmarshal(data, &ref); err != nil {
        return data, nil // Not valid reference JSON, return as-is
    }

    if ref.Type != "nats_object_store" {
        return data, nil
    }

    // Fetch from Object Store
    result, err := c.objectStore.GetBytes(ref.Key)
    if err != nil {
        return nil, fmt.Errorf("failed to fetch payload %s: %w", ref.Key, err)
    }

    return result, nil
}
```

Apply in the event channel callback:

```go
// In SendMessage(), where events are received:
data := msg.Data
resolved, err := c.resolvePayload(data)
if err != nil {
    log.Warn("Failed to resolve payload reference", zap.Error(err))
    // Fall through with original data
} else {
    data = resolved
}
```

### What NOT to Change

- SSE to browser: no change. The resolved payload is forwarded via SSE as before.
- abaper-mcp: no change. It sends normal HTTP responses to cai-llm-router.
- KrakenD gateways: no change. They proxy HTTP, not NATS.

### TTL and Cleanup

Objects auto-expire after 1 hour (configurable via `TTL` in Object Store config). No manual cleanup needed. NATS handles garbage collection.

### Test

1. Simulate a large payload by having abaper-mcp return a huge class source (or mock it)
2. Check cai-llm-router logs: should see "stored large payload" with key
3. Check cai-bff logs: should see "resolved payload reference" with key
4. Verify the full content arrives at the browser (no truncation)
5. Wait 1 hour — verify the object is auto-deleted:
   ```bash
   nats object ls cai-payloads
   ```

### Monitoring

```bash
# List objects in store
nats object ls cai-payloads

# Check store info (size, count)
nats object info cai-payloads

# Watch for new objects
nats object watch cai-payloads
```

### Rollback

1. Remove the `PublishWithLargePayloadSupport` function, revert to `Publish`
2. Remove the `resolvePayload` function in cai-bff
3. Remove Object Store initialization
4. Delete the bucket: `nats object rm cai-payloads`

If references are in-flight during rollback, consumers will see the reference JSON instead of the payload — but this only affects the 1-hour TTL window. Not destructive.

### Stage 3: MinIO (Future, Unlikely)

Only consider if:
- Payloads regularly exceed 50MB (unlikely for ABAP source)
- Cross-datacenter durability is needed
- Signed URLs for external access are required

Implementation: Replace NATS Object Store with MinIO S3 API. Same reference pattern, different storage backend. Not detailed here because it's speculative.

## Impact

| Metric | Stage 2 (Object Store) |
|--------|----------------------|
| **Latency** | +20-50ms per large payload (store + retrieve). Normal payloads: zero impact. |
| **Ops complexity** | Low — built into NATS JetStream. No new services. |
| **Observability** | `nats object ls/info` shows stored objects, sizes, TTLs. |
| **Failure modes** | Object Store full → publish error → fall back to direct publish (may hit size limit). NATS down → both publish and retrieve fail (same as today). |
