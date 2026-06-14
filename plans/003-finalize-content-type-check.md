# Plan 003: Re-verify the stored object's content-type on video finalize

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb2af4b..HEAD -- backend/internal/videos/service.go backend/internal/storage/`
> If any of those changed, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

Set-video uploads go to Cloudflare R2 via a presigned PUT. On upload creation the
API validates the declared content-type against an allow-list
(`video/mp4`, `video/quicktime`, `video/webm`) and stores it on the row. But the
**finalize** step only re-checks the object's *size*, not its *content-type* — even
though `Head` already returns the stored content-type and the row already holds the
expected one. A client that obtains a presigned URL for a video slot could land an
object whose actual content-type differs from what was reserved, and the app would
mark it `ready` and later serve a playback URL for it. This is a cheap, low-risk
hardening: compare the two values that are already in hand and reject on mismatch,
mirroring the existing size-mismatch handling.

## Current state

- `backend/internal/storage/store.go` — `HeadResult` already carries the content-type:
  ```go
  type HeadResult struct {
  	SizeBytes   int64
  	ContentType string
  }
  ```
  and `R2Store.Head` (`storage/r2.go:108-115`) populates it from S3 metadata.
- `backend/internal/videos/service.go` — `allowedContentTypes` and `Finalize`:
  ```go
  var allowedContentTypes = map[string]string{
  	"video/mp4":       "mp4",
  	"video/quicktime": "mov",
  	"video/webm":      "webm",
  }
  ```
  The row stores the reserved content-type as `*string` (`CreateUpload` sets
  `ContentType: &in.ContentType`, `service.go:84`). In `Finalize`, after `Head`
  succeeds, the code checks size and a size-mismatch but never content-type
  (`service.go:135-154`):
  ```go
  if head.SizeBytes > s.limits.MaxBytes {
  	if derr := s.store.Delete(ctx, row.StorageKey); derr != nil { ... }
  	_ = s.repo.MarkFailed(ctx, videoID)
  	return nil, fmt.Errorf("%w: uploaded file exceeds the size limit", ErrInvalidInput)
  }

  if row.SizeBytes != nil && *row.SizeBytes != head.SizeBytes {
  	... // delete + MarkFailed + reject with size mismatch
  }

  updated, err := s.repo.MarkReady(ctx, videoID, head.SizeBytes)
  ```
- **Convention to match**: the existing size-mismatch branch is the exact shape to
  copy — on a bad object: `s.store.Delete(ctx, row.StorageKey)` (best-effort, log on
  error via `s.log.Warn`), `_ = s.repo.MarkFailed(ctx, videoID)`, then
  `return nil, fmt.Errorf("%w: <message>", ErrInvalidInput)`.
- **Test scaffolding already exists**: `backend/internal/videos/service_test.go` has a
  `fakeStore` whose `Head` returns a caller-supplied `storage.HeadResult`, and helpers
  `readyRow(id)` / `sizedRow(id, size)`. Note `readyRow`/`sizedRow` currently set **no**
  `ContentType` on the row. The happy-path test returns `HeadResult{SizeBytes: 4096}`
  (empty `ContentType`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Run videos tests | `cd backend && go test ./internal/videos/...` | `ok ... videos` |
| Run all tests | `cd backend && make test` | all packages `ok` |
| Vet | `cd backend && go vet ./internal/videos/...` | exit 0 |

## Scope

**In scope**:
- `backend/internal/videos/service.go` (add the content-type check in `Finalize`)
- `backend/internal/videos/service_test.go` (add cases; adjust helpers as noted)

**Out of scope** (do NOT touch):
- `backend/internal/storage/*` — `HeadResult.ContentType` already exists and is
  populated; no change needed.
- `backend/internal/videos/repository.go`, `handler.go`, `mapper.go`, `dto.go`.
- The presigned-PUT signing logic — do not try to change how R2 enforces headers;
  this plan adds an application-side check, which is the in-scope mitigation.

## Git workflow

- Branch: `advisor/003-finalize-content-type-check`
- One commit; message style: conventional commits, e.g.
  `fix(videos): reject finalize when stored content-type ≠ reserved`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the content-type guard in `Finalize`

In `backend/internal/videos/service.go`, insert a new check **after** the
size-mismatch block (after `service.go:154`) and **before** the `MarkReady` call.
Be tolerant of an empty stored value from `Head` (some configs may not return one)
and of a nil reserved value — only reject on a definite mismatch:

```go
// Reject if the object that actually landed isn't the content-type we
// reserved the slot for. Mirrors the size-mismatch handling above: the
// upload is repudiated, the object purged, and the slot freed. Skip the
// check when either side is unknown (older rows, or a store that doesn't
// return a content-type) to avoid false rejections.
if row.ContentType != nil && head.ContentType != "" && head.ContentType != *row.ContentType {
	s.log.Warn("video upload content-type mismatch; rejecting",
		slog.String("key", row.StorageKey),
		slog.String("reserved_type", *row.ContentType),
		slog.String("stored_type", head.ContentType),
	)
	if derr := s.store.Delete(ctx, row.StorageKey); derr != nil {
		s.log.Warn("failed to delete mismatched-type video object", slog.String("key", row.StorageKey), slog.Any("error", derr))
	}
	_ = s.repo.MarkFailed(ctx, videoID)
	return nil, fmt.Errorf("%w: uploaded file type does not match the reserved type", ErrInvalidInput)
}
```

**Verify**: `cd backend && go build ./internal/videos/...` → exit 0.

### Step 2: Add tests

In `backend/internal/videos/service_test.go`:

1. Add a helper that builds a row with both a size and a content-type (so existing
   helpers stay untouched):
   ```go
   func typedRow(id uuid.UUID, size int64, ct string) *generated.SetVideo {
   	row := sizedRow(id, size)
   	row.ContentType = &ct
   	return row
   }
   ```
2. **New test — mismatch is rejected**: `getOwnedFn` returns
   `typedRow(id, 4096, "video/mp4")`; `headFn` returns
   `storage.HeadResult{SizeBytes: 4096, ContentType: "text/html"}`. Assert:
   `Finalize` returns `ErrInvalidInput`, `MarkReady` was **not** called
   (use a `markReadyFn` that flips a bool, like `TestFinalize_SizeMismatchIsDeletedAndRejected`),
   `markFailedFn` was called, and `len(store.deleted) == 1`.
3. **New test — matching type passes**: `getOwnedFn` returns
   `typedRow(id, 4096, "video/mp4")`; `headFn` returns
   `storage.HeadResult{SizeBytes: 4096, ContentType: "video/mp4"}`; `markReadyFn`
   returns a ready row. Assert no error and `out.Status == "ready"`.
4. **Confirm the existing happy-path test still passes** unchanged — it returns
   `HeadResult{SizeBytes: 4096}` with an empty `ContentType`, which the guard skips,
   so it must remain green. Do not modify `TestFinalize_HappyPathMarksReadyWithPlayback`.

**Verify**: `cd backend && go test ./internal/videos/ -run Finalize -v` → all pass,
including the two new cases and the unchanged happy path.

### Step 3: Full suite green

**Verify**: `cd backend && go vet ./internal/videos/... && make test` → exit 0.

## Test plan

- New cases in `videos/service_test.go`: content-type mismatch → rejected + purged +
  marked failed + not-ready; content-type match → ready. Plus the unchanged
  empty-content-type happy path (regression guard that the check is correctly skipped
  when the store returns no type).
- Pattern to copy: `TestFinalize_SizeMismatchIsDeletedAndRejected` in the same file —
  same fake wiring (`getOwnedFn`/`headFn`/`markReadyFn`/`markFailedFn`, `store.deleted`).
- Verification: `cd backend && go test ./internal/videos/... -v` → all pass.

## Done criteria

ALL must hold:

- [ ] `Finalize` rejects with `ErrInvalidInput` when `head.ContentType` is non-empty
      and differs from `*row.ContentType`, deleting the object and calling `MarkFailed`.
- [ ] `cd backend && go test ./internal/videos/...` exits 0 with ≥2 new cases.
- [ ] `cd backend && make test` exits 0.
- [ ] `git status` shows only `service.go` and `service_test.go` under
      `internal/videos/` changed (plus `plans/README.md`).
- [ ] `plans/README.md` status row for 003 updated.

## STOP conditions

Stop and report back if:

- `HeadResult` no longer has a `ContentType` field, or `Head` doesn't populate it
  (drift) — the plan's premise no longer holds.
- The existing happy-path test (`TestFinalize_HappyPathMarksReadyWithPlayback`) starts
  failing after your change — that means the guard isn't correctly skipping empty
  content-types; do not "fix" it by editing that test, fix the guard condition.
- You find that R2 normalizes content-types in a way that would make exact-match
  comparison reject legitimate uploads (e.g. `video/mp4; charset=…`) — report it; we
  may need a prefix/normalized compare rather than blanket exact-match.

## Maintenance notes

- If the allow-list `allowedContentTypes` grows, this check needs no change — it
  compares stored vs. reserved, not against the list.
- A reviewer should confirm the check is **skipped** (not failing-open dangerously)
  when `head.ContentType == ""`, and that the reject path mirrors the size-mismatch
  path (delete + MarkFailed + `ErrInvalidInput`).
- Deferred: enforcing content-type at the R2 bucket-policy level (so a wrong type is
  rejected at PUT time, not just at finalize) is a stronger defense but is an infra
  change, out of scope for this code plan.
