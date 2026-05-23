.PHONY: run build tidy test db-up db-down db-reset db-logs

run:
	go run ./cmd/api

build:
	go build -o bin/api ./cmd/api

tidy:
	go mod tidy

test:
	go test ./...

# Reverse-engineers GORM models + query API from the live DB schema
# (gorm/gen). Requires `make db-up` to be running.
generate:
	go run ./cmd/gen

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
