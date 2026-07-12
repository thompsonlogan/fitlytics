.PHONY: run build tidy test test-cover generate swagger swagger-install db-up db-down db-reset db-logs

# `run` and `build` depend on docs/docs.go because cmd/api/main.go blank-imports
# it. The docs are git-ignored, so a fresh clone needs them generated once; the
# rule below produces them automatically as long as the swag CLI is on PATH.
run: docs/docs.go
	go run ./cmd/api

build: docs/docs.go
	go build -o bin/api ./cmd/api

# File rule for the swag-generated package. Re-runs whenever the entrypoint or
# any internal package source changes — swag annotations live across the
# feature slices (handlers, programs, sessions, videos) plus apierr/storage
# response models, so depend on all of internal/ rather than a hand-kept list
# that goes stale when the next feature slice is added.
docs/docs.go: cmd/api/main.go $(wildcard internal/*/*.go) $(wildcard internal/*/*/*.go)
	swag init --generalInfo cmd/api/main.go --output docs --parseInternal

tidy:
	go mod tidy

# `test` walks every package, which means even `cmd/api` (with its docs
# blank-import) has to compile. Treat docs/docs.go as a prerequisite so a
# fresh clone can `make test` without a separate setup step.
test: docs/docs.go
	go test ./...

# Same default coverage flow as `make test`, plus a coverprofile + an
# HTML report. Run `go tool cover -func=cover.out` for per-function output.
test-cover: docs/docs.go
	go test ./... -coverprofile=cover.out
	go tool cover -html=cover.out -o cover.html
	@echo "open backend/cover.html in a browser to view the report"

# Reverse-engineers GORM models + query API from the live DB schema
# (gorm/gen). Requires `make db-up` to be running.
generate:
	go run ./cmd/gen

# ─ Swagger / OpenAPI ─────────────────────────────────────────────────────────
# `make swagger` parses the doc comments on cmd/api/main.go + the handler
# packages and writes the OpenAPI spec to backend/docs/. Run it whenever you
# change a handler doc comment or a response DTO. The frontend regenerates its
# typed client from docs/swagger.json.
#
# NOTE: --parseDependency is intentionally omitted. Every response DTO type is
# in an internal package (covered by --parseInternal), and walking the full
# dependency graph (notably the aws-sdk-go-v2 tree pulled in by internal/storage)
# makes swag abort before it registers the internal types.

# One-time install of the swag CLI. Requires $GOBIN (or $GOPATH/bin) on PATH.
swagger-install:
	go install github.com/swaggo/swag/cmd/swag@latest

swagger:
	swag init --generalInfo cmd/api/main.go --output docs --parseInternal

# ─ Database (Flyway via docker-compose) ──────────────────────────────────────
# Compose lives in ../database. `db-up` brings Postgres up and runs
# `clean migrate` — destructive on the data volume, ideal for dev.

db-up:
	cd ../database && docker compose up -d

db-down:
	cd ../database && docker compose down

# Wipes the data volume too — full reset for schema iteration.
db-reset:
	cd ../database && docker compose down -v && docker compose up -d

db-logs:
	cd ../database && docker compose logs -f flyway
