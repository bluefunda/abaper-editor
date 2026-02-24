# Parameterized Go dev Dockerfile — shared by all Go services
# Uses air for hot-reload; source is bind-mounted at runtime.
#
# Build args (set per-service in docker-compose.dev.yml):
#   GH_PAT          – GitHub PAT for private Go modules
#   BUILD_CMD       – go build command (e.g. "go build -o ./tmp/main .")
#   BIN_ARGS        – arguments passed to the built binary
#   EXTRA_PACKAGES  – additional apk packages (e.g. "gcc musl-dev")

FROM golang:1.25-alpine

ARG GH_PAT
ARG BUILD_CMD="go build -o ./tmp/main ."
ARG BIN_ARGS=""
ARG EXTRA_PACKAGES=""

# Install base tools + air
RUN apk add --no-cache git ca-certificates curl ${EXTRA_PACKAGES} \
    && go install github.com/air-verse/air@latest

# Private module access
ENV GOPRIVATE=github.com/bluefunda/*
RUN if [ -n "$GH_PAT" ]; then \
      printf "machine github.com\n  login x-access-token\n  password %s\n" "$GH_PAT" > /root/.netrc \
      && chmod 600 /root/.netrc; \
    fi

WORKDIR /app

# Dependency cache layer
COPY go.mod go.sum ./
RUN go mod download

# Copy source for initial build
COPY . .

# Bake build args into env vars so entrypoint can generate .air.toml at runtime
# (bind mounts overlay /app, so we can't write .air.toml at build time)
ENV AIR_BUILD_CMD=${BUILD_CMD}
ENV AIR_BIN_ARGS=${BIN_ARGS}

# Entrypoint: generate .air.toml then exec air
RUN cat > /entrypoint.sh <<'ENTRY'
#!/bin/sh
cat > /app/.air.toml <<EOF
root = "."
tmp_dir = "tmp"

[build]
cmd = "${AIR_BUILD_CMD}"
bin = "./tmp/main"
full_bin = "./tmp/main ${AIR_BIN_ARGS}"
include_ext = ["go", "tpl", "tmpl", "html", "yaml", "yml", "toml"]
exclude_dir = ["tmp", "vendor", ".git"]
delay = 1000

[log]
time = false

[misc]
clean_on_exit = true
EOF
exec air
ENTRY
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
