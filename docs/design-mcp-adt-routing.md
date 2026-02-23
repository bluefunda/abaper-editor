# Design: abaper-mcp Object Creation via abaper-ts

## Question

> abaper-mcp has a create-object tool that tries to connect to ABAP system/A4H. Instead of this, if abaper-mcp can feed the data required for creating an object to adt (abaper-ts), then abaper-ts will take this as an input and create that artifact. Is this doable? If so, how?

## Answer: It already works this way

**abaper-mcp does NOT connect to SAP directly.** It routes all operations through abaper-ts via REST API calls. This includes object creation.

### Current architecture

```
┌─────────────┐     REST API      ┌─────────────┐     ADT/HTTP     ┌───────────┐
│  abaper-mcp │ ──────────────▶  │  abaper-ts  │ ──────────────▶ │    SAP    │
│  (MCP tools) │  POST /api/v1/   │ (ADT proxy)  │   /sap/bc/adt/  │  System   │
└─────────────┘  objects/create   └─────────────┘                  └───────────┘
```

### Code evidence

**abaper-mcp/apiclient.go** — `CreateObject` method:

```go
func (c *APIClient) CreateObject(ctx context.Context, req CreateObjectRequest) (*CreateObjectResponse, error) {
    body, _ := json.Marshal(req)
    resp, err := c.doRequest(ctx, "POST", "/api/v1/objects/create", body)
    // ...
}
```

**abaper-mcp/tools.go** — `HandleCreateProgram` and `HandleCreateClass`:

```go
func (h *ToolHandler) HandleCreateProgram(ctx context.Context, args map[string]interface{}) (*mcp.CallToolResult, error) {
    // ... extract name, description, package, transport from args
    resp, err := h.apiClient.CreateObject(ctx, CreateObjectRequest{
        ObjectType:  "program",
        ObjectName:  name,
        Description: description,
        Package:     pkg,
        Transport:   transport,
        Source:      source,
    })
    // ...
}
```

**abaper-ts/src/routes/objects.ts** — POST `/api/v1/objects/create`:

```typescript
router.post('/create', async (req, res) => {
    const { objectType, objectName, description, devclass, transport, source } = req.body;
    // ... uses SAP ADT connection from pool to create the object
});
```

### How SAP credentials flow

```
Browser → abaper-gw (KrakenD) → abaper-ts
                                    ↓
                              X-SAP-Host header → connectionPool lookup
                              X-SAP-Client header
                              X-SAP-User / X-SAP-Password (or stored creds)
```

The `sapCredentials` middleware in abaper-ts extracts SAP connection details from request headers. The connection pool maintains authenticated SAP sessions.

For MCP calls, abaper-mcp forwards these headers when calling abaper-ts:

```go
func (c *APIClient) doRequest(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
    req, _ := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-SAP-Host", c.sapHost)
    req.Header.Set("X-SAP-Client", c.sapClient)
    // ...
}
```

## What could be improved

Even though the routing already goes through abaper-ts, there are opportunities to make it better:

### 1. Draft/staging pattern

Currently, create-object writes directly to the SAP system. A draft pattern would let the AI propose changes that the user reviews before committing:

```
abaper-mcp → POST /api/v1/objects/draft    → abaper-ts stores in memory/DB
User reviews in editor UI
User confirms → POST /api/v1/objects/commit → abaper-ts writes to SAP via ADT
```

This gives users a safety net before AI-generated code hits the SAP system.

### 2. Richer error responses

abaper-ts could return structured error information from SAP ADT (syntax errors, authorization failures, transport issues) that abaper-mcp can relay back to the AI for self-correction:

```json
{
  "success": false,
  "error": {
    "type": "syntax_error",
    "message": "Variable LV_RESULT is not defined",
    "line": 15,
    "column": 3
  }
}
```

The AI could then fix the syntax error and retry, without user intervention.

### 3. Multi-step object creation

For complex objects (classes with methods, function groups with function modules), break creation into atomic steps:

```
1. Create class shell        → POST /api/v1/objects/create (type: class)
2. Add method definition     → POST /api/v1/objects/update (add method)
3. Add method implementation → POST /api/v1/objects/update (add impl)
4. Activate                  → POST /api/v1/objects/activate
5. Run syntax check          → POST /api/v1/objects/check
```

This is more resilient than sending the entire class source in one shot.

### 4. MCP credential forwarding

Currently, abaper-mcp needs SAP credentials configured at startup. A better pattern would be for the editor to pass the active SAP connection context through the AI chat session, so abaper-mcp uses whatever system the user is currently connected to:

```
Editor UI → CAI-GW → abaper-mcp (receives SAP context from chat session)
                         ↓
                    abaper-ts (uses forwarded credentials)
                         ↓
                    SAP System (user's active connection)
```

## Summary

| Aspect | Current State | Notes |
|---|---|---|
| MCP → abaper-ts routing | Already implemented | All MCP tools call abaper-ts REST API |
| Direct SAP connection from MCP | None | abaper-mcp has no SAP SDK dependency |
| Object creation flow | Working | `CreateObject` → `POST /api/v1/objects/create` |
| Draft/review pattern | Not implemented | Potential improvement for safety |
| Error-based AI retry | Not implemented | Potential improvement for autonomy |
| Multi-step creation | Not implemented | Potential improvement for complex objects |
| Dynamic credential forwarding | Not implemented | Potential improvement for multi-system |
