# Database backups & restore

## What is backed up

- The Coolify-managed production PostgreSQL `fitlytics` database is backed up
  through Coolify Scheduled Backups. Coolify uses `pg_dump` custom format with
  ownership and ACL metadata omitted.
- A full database dump includes application data, schema objects, and the
  `fitlytics.flyway_schema_history` table. The versioned migrations in this
  repository remain the canonical source for rebuilding the schema.
- Set videos are not included in PostgreSQL backups. They live in Cloudflare R2
  and are treated as auxiliary media whose uploaded originals remain with
  users. This is an accepted risk; enable R2 object versioning in a separate
  follow-up if the loss tolerance changes.
- Database backups must use a dedicated R2 bucket, such as
  `fitlytics-db-backups`. Never store them in the videos bucket: backups need
  separate credentials, retention, lifecycle, and privacy controls.

## Configuration (Coolify UI - the source of truth)

1. In Cloudflare, create a dedicated R2 bucket and an Object Read & Write API
   token scoped only to that bucket. Record the S3 endpoint shown by R2
   (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`) and use region `auto`.
   Never commit its access key or secret.
2. In Coolify, add and validate an S3-compatible storage destination using the
   R2 endpoint, dedicated bucket, region, access key, and secret.
3. Open the production PostgreSQL resource's **Scheduled Backups** section and
   create an enabled schedule for the `fitlytics` database:
   - Schedule: daily at an off-peak time, for example `0 4 * * *` (04:00 in
     the Coolify server's configured time zone).
   - Local retention: at least 7 completed backups.
   - S3 retention: at least 7 completed backups in the dedicated R2 bucket.
4. After creating or changing the schedule, select **Backup now**. Confirm the
   execution succeeds and a non-empty artifact appears at every configured
   destination.

If R2 validation fails because of endpoint or region compatibility, keep at
least 7 local backups temporarily and record the missing offsite copy as an
open production risk. Do not treat local-only retention as completion of this
runbook.

Current production configuration is intentionally not recorded here until the
operator completes the checklist below. Coolify remains the source of truth for
the active schedule, destinations, and retention values.

## Restore procedure (verified 2026-07-25 against a dev dump)

Use a trusted workstation with enough free disk space. Production dumps contain
sensitive user and workout data: do not upload them to tickets, chat, or source
control, and delete every local copy and restore container after the drill.

Use the same PostgreSQL major version that created the custom-format dump. The
current production version is PostgreSQL 16, so this procedure uses
`postgres:16`.

### 1. Obtain a backup

For a production drill, download the latest successful artifact from every
configured destination and place the artifact being tested at
`./backup-under-test.dump`.

The local rehearsal used Coolify's effective dump flags:

```bash
docker exec fitlytics_db pg_dump \
  --format=custom --no-acl --no-owner \
  -U fitlytics -d fitlytics \
  -f /tmp/fitlytics-rehearsal.dump
docker cp fitlytics_db:/tmp/fitlytics-rehearsal.dump ./backup-under-test.dump
```

The verified rehearsal dump was 112,607 bytes. A production artifact will have
a different size, but it must be non-zero and plausibly sized for the database.

### 2. Restore into an isolated PostgreSQL 16 container

The container publishes no host port, which prevents the restored production
data from being exposed on the network.

```bash
docker run -d --rm --name restoretest \
  -e POSTGRES_PASSWORD=pw \
  postgres:16

# Repeat this readiness check until it reports "accepting connections".
docker exec restoretest pg_isready -U postgres

docker cp ./backup-under-test.dump restoretest:/tmp/backup-under-test.dump
docker exec restoretest createdb -U postgres restored
docker exec restoretest pg_restore \
  --exit-on-error --no-acl --no-owner \
  -U postgres -d restored \
  /tmp/backup-under-test.dump
```

### 3. Run sanity and freshness checks

```bash
docker exec restoretest psql -U postgres -d restored -P pager=off -c "
SELECT 'users' AS check_name, count(*)::text AS observed_value
  FROM fitlytics.users
UNION ALL
SELECT 'programs', count(*)::text FROM fitlytics.programs
UNION ALL
SELECT 'set_logs', count(*)::text FROM fitlytics.set_logs
UNION ALL
SELECT 'latest_session', COALESCE(max(created_at)::text, 'NULL')
  FROM fitlytics.sessions
UNION ALL
SELECT 'flyway_history', count(*)::text
  FROM fitlytics.flyway_schema_history;
"
```

The production drill passes only when the counts are plausible for the live
application, the Flyway history is present, and `latest_session` is close to
the backup creation time. Compare with production metrics or a read-only query
when exact expected counts are available.

Observed during the 2026-07-25 local rehearsal:

| Check | Observed value |
|---|---:|
| `fitlytics.users` | 2 |
| `fitlytics.programs` | 2 |
| `fitlytics.set_logs` | 94 |
| Latest `fitlytics.sessions.created_at` | `2026-07-19 18:31:58.838788+00` |
| `fitlytics.flyway_schema_history` | 9 |

### 4. Clean up

```bash
docker stop restoretest
rm -f ./backup-under-test.dump
```

Also remove the downloaded source artifact if it lives elsewhere. The
`--rm` flag deletes the restore container when it stops.

## Restore drill

- Run a production-backup restore drill quarterly and immediately after any
  PostgreSQL major-version change.
- Download the latest production backup from each configured destination. At
  minimum, restore and validate the offsite R2 copy; periodically test the
  local Coolify copy as well.
- Follow the restore procedure above, run every sanity query, and record the
  artifact timestamp, result, and any warnings in the drill log.
- A successful upload is not sufficient. The backup is verified only after
  `pg_restore` and the sanity queries succeed against the downloaded artifact.

## Drill log

| Date | Backup restored | Result | Notes |
|---|---|---|---|
| 2026-07-25 | Local seeded development dump | PASS | PostgreSQL 16 custom-format dump; 112,607 bytes; restore and all sanity queries succeeded. This does not verify production backup configuration. |
| _Operator fills after first production drill_ | | | |

## Operator checklist

1. Coolify -> Postgres resource -> **Scheduled Backups**: confirm whether a
   schedule already exists. If yes, record its schedule, retention, and
   destination in this runbook and continue at item 4.
2. Create the schedule described above: daily, with retention of at least 7.
3. Create a dedicated R2 bucket such as `fitlytics-db-backups` and a
   bucket-scoped API token, then configure it as the S3 destination. If Coolify
   and R2 disagree on endpoint or region settings, local-only retention is
   acceptable temporarily, but record it as an open risk here.
4. Select **Backup now** and confirm a non-empty artifact lands at every
   configured destination.
5. Download that artifact, restore it locally with this runbook, run the sanity
   queries, and fill the first production row in the drill log.
6. Only after item 5 succeeds should plan 028 be marked `DONE`.

## References

- [Coolify scheduled database backups](https://coolify.io/docs/databases/backups)
- [Coolify S3-compatible storage](https://coolify.io/docs/knowledge-base/s3/introduction)
- [Cloudflare R2 S3 API configuration](https://developers.cloudflare.com/r2/get-started/s3/)
