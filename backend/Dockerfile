# syntax=docker/dockerfile:1

# ─ Build stage ────────────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS build

# git: some module fetches fall back to VCS. ca-certificates: module-proxy TLS.
RUN apk add --no-cache git ca-certificates

WORKDIR /src

# Download modules first so this layer caches until go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download

# swag generates the docs package that cmd/api/main.go blank-imports. Pin to the
# version in go.mod so the generated code matches the runtime library.
RUN go install github.com/swaggo/swag/cmd/swag@v1.16.6

COPY . .

# Regenerate the OpenAPI docs package. It's git-ignored (never in the build
# context), and cmd/api won't compile without it.
RUN swag init --generalInfo cmd/api/main.go --output docs --parseInternal

# Static, stripped binary — CGO off so it runs on the distroless static image.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ─ Runtime stage ──────────────────────────────────────────────────────────────
# distroless/static ships ca-certificates (needed for outbound TLS to WorkOS
# JWKS and Cloudflare R2) and runs as a non-root user by default.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/api /api

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/api"]
