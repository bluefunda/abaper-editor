#!/usr/bin/env bash
# Extract environment variables from PRD containers into .env.dev
# Connects via SSH to apps and gw nodes, runs printenv inside containers,
# deduplicates (last wins), and writes .env.dev.
set -euo pipefail

OUT=".env.dev"

# Containers on the apps node (ssh apps)
APPS_CONTAINERS=(
  abaper-bff
  abaper-mcp
  abaper-ts
  abaper
  cai-bff
  cai-llm-router
)

# Containers on the gw node (ssh gw)
GW_CONTAINERS=(
  abaper-gw
)

# Variables to filter out (infrastructure noise)
FILTER_REGEX='^(HOSTNAME|HOME|PATH|PWD|SHLVL|NODE_VERSION|YARN_VERSION|VAULT_.*|NATS_CREDS|BLUE_NATS_URL|TEMPORAL_.*|FC_.*)='

if [ -f "$OUT" ]; then
  echo "WARNING: $OUT already exists."
  read -rp "Overwrite? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

echo "Extracting env vars from PRD..."

# Apps node
for container in "${APPS_CONTAINERS[@]}"; do
  echo "  [apps] $container"
  ssh apps "docker exec $container printenv 2>/dev/null" \
    | grep -Ev "$FILTER_REGEX" \
    >> "$tmpfile" || echo "  WARNING: could not extract from $container"
done

# GW node
for container in "${GW_CONTAINERS[@]}"; do
  echo "  [gw] $container"
  ssh gw "docker exec $container printenv 2>/dev/null" \
    | grep -Ev "$FILTER_REGEX" \
    >> "$tmpfile" || echo "  WARNING: could not extract from $container"
done

# Deduplicate: last occurrence of each key wins
declare -A seen
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  seen["$key"]="$value"
done < "$tmpfile"

# Write output
{
  echo "# Auto-extracted from PRD containers — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "# Run 'make extract-env' to regenerate"
  echo ""
  for key in $(printf '%s\n' "${!seen[@]}" | sort); do
    echo "${key}=${seen[$key]}"
  done
} > "$OUT"

echo ""
echo "Wrote $(wc -l < "$OUT" | tr -d ' ') lines to $OUT"
echo "Review and adjust values for local development (e.g. service URLs)."
