# Phase 5 — Config-Driven Prompt Conditioning

## Agent Instructions

Independent of other phases. Can be implemented any time after Phase 0.2 (system prompt hardening). The prompt from Phase 0.2 becomes the first entry in the profile store.

---

## Goal

Make LLM profiles (system prompt, persona, constraints, response format) hot-reloadable without container restarts. Support versioning, rollback, and A/B testing.

## Repo

`cai-llm-router` — Go

## Files to Create

- `internal/policy/profiles.go` — profile manager with NATS KV watch
- `internal/policy/profiles_test.go` — tests

## Files to Modify

- `internal/policy/resolver.go` — read active profile when resolving abaper agent
- `internal/temporal/activities.go` — pass profile to activity context
- `cmd/main.go` (or wherever the server initializes) — start profile watcher

## Config Format

Each profile is stored as a YAML value in NATS KV:

```yaml
# Profile: abaper_default
version: "1.0.0"
model: ""                    # Empty = use request model
system_prompt: |
  You are an SAP ABAP development assistant with direct access to a live SAP system via MCP tools.

  ## Execution Rules
  1. ALWAYS follow this order for creating objects:
     a. Check if the object exists using get-object
     b. If it exists, use update-program or update-class
     c. If it does not exist, use create-program or create-class
     d. After creation/update, ALWAYS call activate-object
     e. If activation fails, fix and retry (max 3 attempts)

  2. For multi-artifact requests:
     a. Plan in dependency order
     b. Create and activate each before moving to the next
     c. Report what succeeded and what failed

  3. After EVERY create or update:
     - Call activate-object
     - Do NOT claim success unless tool returned success: true

  ## Tool Usage
  - create-and-activate: PREFERRED for all creation
  - get-object: Always check existence before creating
  - syntax-check: Use proactively if unsure
  - run-unit-tests: Only after successful activation

persona: "expert_abap_developer"

constraints:
  max_retries: 2
  repair_mode: true
  require_activation: true

response_format:
  include_summary: true
  include_reasoning: false
  include_execution_log: false

environment_overrides:
  dev:
    constraints:
      max_retries: 5
    response_format:
      include_reasoning: true
      include_execution_log: true
```

## NATS KV Bucket Structure

```
Bucket: llm-profiles

Keys:
  abaper_default         → YAML (the production profile)
  abaper_verbose         → YAML (verbose mode for debugging)
  abaper_experimental    → YAML (experimental prompt strategies)
  _active                → "abaper_default" (string: which profile to use)
  _routing               → YAML (optional: A/B test routing weights)
```

## Profile Manager Implementation

```go
package policy

type LLMProfile struct {
    Version       string            `yaml:"version"`
    Model         string            `yaml:"model"`
    SystemPrompt  string            `yaml:"system_prompt"`
    Persona       string            `yaml:"persona"`
    Constraints   ProfileConstraints `yaml:"constraints"`
    ResponseFormat ResponseFormat   `yaml:"response_format"`
    EnvOverrides  map[string]EnvOverride `yaml:"environment_overrides"`
}

type ProfileConstraints struct {
    MaxRetries        int  `yaml:"max_retries"`
    RepairMode        bool `yaml:"repair_mode"`
    RequireActivation bool `yaml:"require_activation"`
}

type ResponseFormat struct {
    IncludeSummary      bool `yaml:"include_summary"`
    IncludeReasoning    bool `yaml:"include_reasoning"`
    IncludeExecutionLog bool `yaml:"include_execution_log"`
}

type EnvOverride struct {
    Constraints    *ProfileConstraints `yaml:"constraints,omitempty"`
    ResponseFormat *ResponseFormat     `yaml:"response_format,omitempty"`
}

type ProfileManager struct {
    kv          jetstream.KeyValue
    current     atomic.Value  // *LLMProfile
    profileName atomic.Value  // string
    env         string        // "dev" or "prd"
    mu          sync.RWMutex
}

func NewProfileManager(js jetstream.JetStream, env string) (*ProfileManager, error) {
    kv, err := js.CreateOrUpdateKeyValue(context.Background(), jetstream.KeyValueConfig{
        Bucket:  "llm-profiles",
        History: 10,  // Keep 10 revisions per key
    })
    if err != nil {
        return nil, err
    }

    pm := &ProfileManager{kv: kv, env: env}

    // Load initial profile
    if err := pm.loadActive(); err != nil {
        // No profile yet — use built-in default
        pm.current.Store(pm.builtinDefault())
    }

    return pm, nil
}

// Current returns the active profile (lock-free read)
func (pm *ProfileManager) Current() *LLMProfile {
    return pm.current.Load().(*LLMProfile)
}

// Watch starts watching for profile changes (run in goroutine)
func (pm *ProfileManager) Watch(ctx context.Context) {
    watcher, err := pm.kv.Watch(ctx, "_active")
    if err != nil {
        log.Error().Err(err).Msg("Failed to watch profile changes")
        return
    }

    for entry := range watcher.Updates() {
        if entry == nil {
            continue
        }
        profileName := string(entry.Value())
        log.Info().Str("profile", profileName).Uint64("revision", entry.Revision()).Msg("Active profile changed")

        if err := pm.loadProfile(profileName); err != nil {
            log.Error().Err(err).Str("profile", profileName).Msg("Failed to load profile, keeping current")
            continue
        }
        pm.profileName.Store(profileName)
    }
}

func (pm *ProfileManager) loadActive() error {
    entry, err := pm.kv.Get(context.Background(), "_active")
    if err != nil {
        return err
    }
    return pm.loadProfile(string(entry.Value()))
}

func (pm *ProfileManager) loadProfile(name string) error {
    entry, err := pm.kv.Get(context.Background(), name)
    if err != nil {
        return fmt.Errorf("profile %s not found: %w", name, err)
    }

    var profile LLMProfile
    if err := yaml.Unmarshal(entry.Value(), &profile); err != nil {
        return fmt.Errorf("invalid profile YAML: %w", err)
    }

    // Apply environment overrides
    if override, ok := profile.EnvOverrides[pm.env]; ok {
        if override.Constraints != nil {
            profile.Constraints = *override.Constraints
        }
        if override.ResponseFormat != nil {
            profile.ResponseFormat = *override.ResponseFormat
        }
    }

    pm.current.Store(&profile)
    log.Info().Str("profile", name).Str("version", profile.Version).Msg("Profile loaded")
    return nil
}

func (pm *ProfileManager) builtinDefault() *LLMProfile {
    return &LLMProfile{
        Version:      "builtin",
        SystemPrompt: "You are an SAP ABAP development assistant.", // Minimal fallback
        Constraints:  ProfileConstraints{MaxRetries: 2, RepairMode: true, RequireActivation: true},
    }
}
```

## Integration with Resolver

In `internal/policy/resolver.go`, modify `Resolve()`:

```go
func (r *Resolver) Resolve(req *messages.ChatRequest) AgentConfig {
    // ... existing routing logic ...

    // If this is the abaper agent, apply the active LLM profile
    if agent.Name == "abaper" && r.profileManager != nil {
        profile := r.profileManager.Current()
        if profile.SystemPrompt != "" {
            agent.SystemPrompt = profile.SystemPrompt
        }
        if profile.Model != "" {
            agent.Model = profile.Model
        }
        // MaxIterations derived from constraints
        // Each retry needs ~3 iterations (create + activate + LLM reasoning)
        if profile.Constraints.MaxRetries > 0 {
            minIterations := profile.Constraints.MaxRetries * 5
            if minIterations > agent.MaxIterations {
                agent.MaxIterations = minIterations
            }
        }
    }

    return agent
}
```

## A/B Testing (Optional)

Store routing weights in `_routing` key:

```yaml
# NATS KV key: _routing
profiles:
  - name: abaper_default
    weight: 90
  - name: abaper_experimental
    weight: 10
```

In `ProfileManager.Current()`:

```go
func (pm *ProfileManager) CurrentForRequest(requestID string) *LLMProfile {
    routing := pm.routing.Load()
    if routing == nil {
        return pm.current.Load().(*LLMProfile)
    }

    // Deterministic selection based on request hash
    hash := fnv32(requestID)
    roll := hash % 100

    cumulative := 0
    for _, entry := range routing.Profiles {
        cumulative += entry.Weight
        if int(roll) < cumulative {
            return pm.loadCached(entry.Name)
        }
    }
    return pm.current.Load().(*LLMProfile)
}
```

## Seeding Initial Profiles

After deploying:

```bash
# Connect to NATS on apps node
ssh apps

# Seed the default profile (content from Phase 0.2 system prompt)
nats kv put llm-profiles abaper_default < /path/to/abaper_default.yaml

# Set it active
nats kv put llm-profiles _active 'abaper_default'

# Verify
nats kv get llm-profiles _active
nats kv get llm-profiles abaper_default
```

## Manual Test

```bash
# 1. Seed a test profile
nats kv put llm-profiles abaper_test '
version: "0.0.1-test"
system_prompt: "You are a test assistant. Always start your response with: [TEST MODE]"
constraints:
  max_retries: 0
  repair_mode: false
'

# 2. Switch to test profile
nats kv put llm-profiles _active 'abaper_test'

# 3. Watch cai-llm-router logs for profile change detection
docker logs -f cai-llm-router 2>&1 | grep -i profile

# 4. Send a prompt in abaper-editor
#    → Verify response starts with "[TEST MODE]"

# 5. Roll back to default
nats kv put llm-profiles _active 'abaper_default'

# 6. Send another prompt
#    → Verify normal behavior (no "[TEST MODE]" prefix)

# 7. Check version history
nats kv history llm-profiles _active
```

## Versioning Strategy

NATS KV provides revision numbers automatically. Additionally:

- Each profile YAML contains a `version` field (semver)
- Every request log includes the profile name and version
- `nats kv history llm-profiles <key>` shows all changes with timestamps
- To roll back to a specific revision: fetch the YAML from history, put it back

```bash
# View history
nats kv history llm-profiles abaper_default

# Get specific revision
nats kv get llm-profiles abaper_default --revision 3

# Restore that revision
nats kv get llm-profiles abaper_default --revision 3 | nats kv put llm-profiles abaper_default
```

## Rollback

1. Remove `ProfileManager` from resolver — `agents.yaml` system prompt becomes the source of truth again
2. Remove `profiles.go` and the NATS KV watcher
3. The KV bucket can be left in place or deleted: `nats kv rm llm-profiles`

## Impact

| Metric | Value |
|--------|-------|
| **Latency** | +1-2ms per request (atomic.Value read — effectively zero). Profile changes propagate in <100ms via NATS Watch. |
| **Ops complexity** | Medium — requires `nats` CLI for profile management. Consider building a simple admin UI later. |
| **Observability** | Profile name + version logged per request. A/B test metrics: group by profile in logs. KV history provides full audit trail. |
| **Failure modes** | NATS KV unavailable → last-known profile used (atomic.Value cache). Invalid YAML → parse error logged, old profile retained. Empty `_active` key → builtin default used. |
