# Plan 002: Stop Finalize from failing uploads on transient storage errors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: This plan was written against **uncommitted**
> work on branch `set-video-upload` (HEAD was `eb95537`; the videos code exists
> only in the working tree). Verify the "Current state" excerpts below match
> the live files. If `backend/internal/videos/` does not exist, STOP.
>
> **Additional Context**: You should not edit any of the generated files. You can review
> information in the repos README.md for information on how to run all the services and
> and database which should give you everything you need to regenerate the code while
> working through the changes in this plan.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `eb95537` (+ uncommitted `set-video-upload` working tree), 2026-06-12

## Why this matters

After the browser finishes a direct-to-R2 upload, it calls
`POST /api/videos/{id}/finalize`. The service verifies the object landed by
calling `Head` on the store. Today **any** `Head` error — a network blip, R2
throttling, a 5xx from Cloudflare — is treated as "the upload never happened":
the video row is permanently marked `failed` and the client gets a 400. For a
file that can be 500 MB, that means a transient hiccup forces the user to
re-upload the entire file even though the object is sitting in the bucket.
Only a genuine 404 ("object not found") should mark the row failed; everything
else should surface as a retryable 500 with the row left `pending`.

## Current state

- `backend/internal/storage/store.go` — `ObjectStore` interface; `Head` is
  documented as returning "an error if it is absent" but has no way to
  distinguish absent from broken:

```go
// store.go:36-38
	// Head returns the stored object's metadata, or an error if it is absent.
	Head(ctx context.Context, key string) (HeadResult, error)
```

- `backend/internal/storage/r2.go:96-112` — the R2 implementation wraps every
  error identically:

```go
func (s *R2Store) Head(ctx context.Context, key string) (HeadResult, error) {
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return HeadResult{}, fmt.Errorf("head object: %w", err)
	}
	...
```

- `backend/internal/videos/service.go:119-149` — `Finalize` conflates the
  cases:

```go
	head, err := s.store.Head(ctx, row.StorageKey)
	if err != nil {
		// No object landed — mark failed so the slot frees up and reject.
		_ = s.repo.MarkFailed(ctx, videoID)
		return nil, fmt.Errorf("%w: upload not found in storage", ErrInvalidInput)
	}
```

- Error-handling convention: the videos service returns sentinel errors
  (`ErrNotFound`, `ErrInvalidInput`, `ErrQuotaExceeded` — see
  `backend/internal/videos/service.go:17-20` and `repository.go:19`); the
  handler maps them to problem responses in
  `backend/internal/videos/handler.go:231-244` (`writeServiceError`). Anything
  unmapped becomes a logged 500. A transient Head failure should take the
  unmapped (500) path.
- Test convention: Go stdlib testing with hand-written fakes, no mock
  libraries. The fakes for this package are in
  `backend/internal/videos/service_test.go:24-88` (`fakeRepo`, `fakeStore`).
  The existing test to model after is `TestFinalize_MissingObjectMarksFailed`
  (`service_test.go:186`).
- The Go module uses `github.com/aws/aws-sdk-go-v2/service/s3` already; its
  sibling `service/s3/types` package is available without a new dependency
  (it ships in the same module).

## Commands you will need

| Purpose   | Command (run in `backend/`)                      | Expected on success |
| --------- | ------------------------------------------------ | ------------------- |
| Build     | `go build ./...`                                 | exit 0              |
| Tests     | `go test ./internal/videos/ ./internal/storage/` | all pass            |
| All tests | `go test ./...`                                  | all pass            |
| Tidy      | `go mod tidy`                                    | no diff to go.mod   |

## Scope

**In scope** (the only files you should modify):

- `backend/internal/storage/store.go`
- `backend/internal/storage/r2.go`
- `backend/internal/videos/service.go`
- `backend/internal/videos/service_test.go`

**Out of scope** (do NOT touch, even though they look related):

- `backend/internal/videos/handler.go` — the existing sentinel→status mapping
  already does the right thing once the service stops mis-classifying.
- `backend/internal/videos/repository.go` — `MarkFailed` itself is fine.
- The `Delete` path's missing-key behavior — deleting a missing key staying a
  non-error is a separate documented contract.

## Git workflow

- The feature branch `set-video-upload` is uncommitted; edit in place on that
  working tree. Do NOT commit, push, or open a PR unless the operator
  instructed it.

## Steps

### Step 1: Add a sentinel to the storage package

In `backend/internal/storage/store.go`, add:

```go
// ErrNotFound is returned by Head when the object does not exist (as opposed
// to a transient store failure). Callers branch on it with errors.Is.
var ErrNotFound = errors.New("storage: object not found")
```

(add the `"errors"` import) and update `Head`'s doc comment on the interface to:
`// Head returns the stored object's metadata. Returns an error wrapping
ErrNotFound when the object does not exist; any other error is a store
failure and may be transient.`

**Verify**: `go build ./...` → exit 0.

### Step 2: Map R2 404s onto the sentinel

In `backend/internal/storage/r2.go`, import
`"github.com/aws/aws-sdk-go-v2/service/s3/types"` and
`"github.com/aws/smithy-go"`, then change the error branch of `Head`:

```go
	if err != nil {
		var notFound *types.NotFound
		if errors.As(err, &notFound) {
			return HeadResult{}, fmt.Errorf("head object %q: %w", key, ErrNotFound)
		}
		// Some S3-compatible stores surface HeadObject 404s only as a generic
		// API error with code NotFound/NoSuchKey.
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) {
			code := apiErr.ErrorCode()
			if code == "NotFound" || code == "NoSuchKey" {
				return HeadResult{}, fmt.Errorf("head object %q: %w", key, ErrNotFound)
			}
		}
		return HeadResult{}, fmt.Errorf("head object: %w", err)
	}
```

(`smithy-go` is already an indirect dependency of aws-sdk-go-v2; `go mod tidy`
will promote it to direct.)

**Verify**: `go build ./...` → exit 0, then `go mod tidy` → `git diff backend/go.mod`
shows at most the smithy-go line moving out of the `// indirect` block.

### Step 3: Branch on the sentinel in Finalize

In `backend/internal/videos/service.go`, replace the `Head` error branch of
`Finalize` (currently lines 128–133) with:

```go
	head, err := s.store.Head(ctx, row.StorageKey)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			// No object landed — mark failed so the slot frees up and reject.
			_ = s.repo.MarkFailed(ctx, videoID)
			return nil, fmt.Errorf("%w: upload not found in storage", ErrInvalidInput)
		}
		// Transient store failure: leave the row pending so the client can
		// retry finalize without re-uploading.
		return nil, fmt.Errorf("head upload: %w", err)
	}
```

**Verify**: `go build ./...` → exit 0.

### Step 4: Update and extend the service tests

In `backend/internal/videos/service_test.go`:

1. `TestFinalize_MissingObjectMarksFailed` (line 186): change the fake's
   `headFn` to return an error wrapping the sentinel, e.g.
   `fmt.Errorf("head object: %w", storage.ErrNotFound)` — behavior expectations
   stay the same (marked failed, `ErrInvalidInput` returned).
2. Add `TestFinalize_TransientHeadErrorLeavesPending`: `headFn` returns a
   plain `errors.New("connection reset")`. Assert:
   - the returned error is NOT `ErrInvalidInput` (`!errors.Is(err, ErrInvalidInput)`),
   - `markFailedFn` was never called (give the fake a recording wrapper, e.g.
     set `markFailedFn` to a func that flips a `called` bool and assert it is
     false — the existing fakes are plain function fields, follow that style).

**Verify**: `go test ./internal/videos/ ./internal/storage/` → all pass.

## Test plan

- Updated: `TestFinalize_MissingObjectMarksFailed` — now drives the sentinel path.
- New: `TestFinalize_TransientHeadErrorLeavesPending` — the regression this
  plan exists for: transient error → no `MarkFailed`, no `ErrInvalidInput`.
- Model both after the existing Finalize tests at `service_test.go:186-249`.
- Verification: `cd backend && go test ./...` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && go build ./...` exits 0
- [ ] `cd backend && go test ./...` exits 0, including
      `TestFinalize_TransientHeadErrorLeavesPending`
- [ ] `grep -n "ErrNotFound" backend/internal/storage/store.go` shows the sentinel
- [ ] `grep -n "errors.Is(err, storage.ErrNotFound)" backend/internal/videos/service.go` matches
- [ ] No files outside the in-scope list are modified, except possibly
      `backend/go.mod`/`go.sum` via `go mod tidy` (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live `Finalize` no longer matches the excerpt.
- `errors.As(err, &notFound)` with `*types.NotFound` does not compile against
  the vendored SDK version — report the SDK version (`grep aws-sdk-go-v2
backend/go.mod`) instead of guessing at alternative type names.
- `go mod tidy` wants to change anything beyond promoting `smithy-go`.

## Maintenance notes

- The frontend currently shows a generic "Upload failed" toast for both 400
  and 500 finalize failures. A follow-up could retry finalize automatically on
  5xx — deferred because it needs UX decisions (this plan only makes that
  retry _possible_ by leaving the row `pending`).
- A row left `pending` after a transient failure is recoverable: re-uploading
  the same set replaces it (see `repository.go` CreateUpload), and a future
  janitor for stale pending rows is noted in plans/README.md as rejected-for-now.
- Reviewer should scrutinize: no other `ObjectStore` callsite assumes the old
  "any Head error means missing" contract (at planning time, `Finalize` is the
  only `Head` caller — confirm with `grep -rn "\.Head(" backend/internal`).
