# Plan 005: Video capabilities endpoint + graceful frontend handling when uploads are disabled

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Reconciled 2026-06-13 against branch
> `set-video-upload` at commit `ca63908` — content anchors verified: `NewHandler`
> (handler.go:24), `allowedContentTypes` (service.go:30), `Limits` (service.go:37),
> frontend constants (use-set-videos.ts:12-16), test file is `use-set-videos.test.tsx`.
> One immaterial shift: the `NewHandler` callsite in `router.go` is now at line 82
> (step 3 says ~78) — match by content, not line number. Re-verify the excerpts
> below still match the live files before proceeding. If
> `backend/internal/videos/handler.go` does not exist, STOP.
>
> **Additional Context**: You should not edit any of the generated files. You can review
> information in the repos README.md for information on how to run all the services and
> and database which should give you everything you need to regenerate the code while
> working through the changes in this plan.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (001–004 recommended first but not required)
- **Category**: bug / dx
- **Planned at**: commit `eb95537` + working tree, 2026-06-12; reconciled at `311b632` (excerpts verified, no drift)

## Why this matters

The backend deliberately registers the video routes in "disabled mode" when R2
isn't configured, returning 503 — the handler comment says this is "so the
frontend can distinguish 'not configured' from 'not found'". But the frontend
never makes that distinction: `useSessionVideos` fires on every session view,
React Query retries the failing request (default 3 attempts), the video column
still renders, and an upload attempt dies with a generic toast. Separately, the
client hardcodes the 500 MB cap and the allowed MIME types, which silently
drift if the server's `MAX_VIDEO_BYTES` env var changes. One small capability
endpoint fixes both: the client learns `enabled`, `max_bytes`, and
`allowed_types` from the server, hides the feature when disabled, and stops
duplicating limits.

## Current state

### Backend

- `backend/internal/videos/handler.go` — handler with `service Service`,
  `enabled bool`, `log *slog.Logger` fields; constructor at lines 24–26:

```go
func NewHandler(service Service, enabled bool, log *slog.Logger) *Handler {
	return &Handler{service: service, enabled: enabled, log: log}
}
```

Routes registered at lines 28–34 (`Register`); every route calls `h.guard(c)`
which writes 503 when disabled.

- `backend/internal/videos/service.go:30-34` — the allowed-type map the new
  endpoint must expose (package-level, accessible from the handler):

```go
var allowedContentTypes = map[string]string{
	"video/mp4":       "mp4",
	"video/quicktime": "mov",
	"video/webm":      "webm",
}
```

- `backend/internal/videos/service.go:37-41` — `Limits{MaxBytes, MaxPerUser,
MaxPerDay}`.
- `backend/internal/server/router.go:75-82` — wiring; `deps.VideoLimits` is
  always populated (even when `deps.VideoStore` is nil — see
  `backend/cmd/api/main.go`, the `VideoLimits:` field is set unconditionally):

```go
	videosEnabled := deps.VideoStore != nil
	var videosService videos.Service
	if videosEnabled {
		videosService = videos.NewService(videos.NewRepository(deps.DB), deps.VideoStore, deps.VideoLimits, deps.Log)
	}
	videosHandler := videos.NewHandler(videosService, videosEnabled, deps.Log)
```

- `backend/internal/videos/handler_test.go` — handler tests construct via
  `NewHandler(&fakeService{}, true, silentLogger())` (and `NewHandler(nil,
false, silentLogger())` at line 68). All callsites must be updated when the
  constructor grows a `Limits` parameter. Swagger doc-comment convention: see
  the `@Summary/@Tags/@Success/@Router` blocks on the existing handlers
  (e.g. `handler.go:45-62`).
- DTOs live in `backend/internal/videos/dto.go` with `// @name X` suffixes.

### Frontend

- `frontend/src/hooks/use-set-videos.ts:11-17` — the hardcoded duplicates:

```ts
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024 // 500 MB — matches the backend default

export function isAllowedVideoType(type: string): boolean {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(type)
}
```

- `frontend/src/hooks/use-set-videos.ts:27-37` — `useSessionVideos(sessionId)`,
  fires whenever a session id exists; no awareness of the disabled mode.
- `frontend/src/components/workout/day-board.tsx` — calls
  `useSessionVideos(session?.id)`, builds `videoInfo`, passes `videoInfo` and
  `onOpenVideo` to `WorkoutTable`, and conditionally renders
  `VideoUploadDialog`.
- `frontend/src/components/workout/workout-table.tsx` — the `video` display
  column is appended to the module-level `COLUMNS` array (id `"video"`,
  ~line 208); the `<colgroup>` ends with `<col style={{ width: "3rem" }} />`;
  header/cell centering checks `colId === "video"`. The table is built with
  `useReactTable({ data, columns: COLUMNS, ... })` — TanStack Table column
  visibility (`state: { columnVisibility }`) is the idiomatic way to hide a
  column without restructuring `COLUMNS`.
- `frontend/src/components/workout/video-upload-dialog.tsx:115-124` — client-side
  validation using the hardcoded constants, and a hardcoded copy string
  "MP4, MOV or WebM · up to 500 MB" at line 266.
- API auth is **cookie-based**: the generated client is configured in
  `frontend/src/main.tsx:27-33` with
  `basePath: API_BASE_URL` (`const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""`,
  line 15) and `credentials: "include"`. A hand-written `fetch` to a new
  endpoint must replicate exactly those two things. The typed client is
  generated from swagger (`pnpm api_generate`, requires a running backend) —
  **do not regenerate it in this plan**; use a plain `fetch` for the one new
  endpoint and leave regeneration as a follow-up (see Maintenance notes).
- Repo conventions: no `useEffect` (derive inline); named UI components get
  their own file; Tailwind utilities only.

## Commands you will need

| Purpose            | Command                         | Expected on success |
| ------------------ | ------------------------------- | ------------------- |
| Backend build      | `cd backend && go build ./...`  | exit 0              |
| Backend tests      | `cd backend && go test ./...`   | all pass            |
| Frontend typecheck | `cd frontend && pnpm typecheck` | exit 0              |
| Frontend tests     | `cd frontend && pnpm test`      | all pass            |
| Frontend lint      | `cd frontend && pnpm lint`      | exit 0              |

## Scope

**In scope** (the only files you should modify/create):

- `backend/internal/videos/dto.go`
- `backend/internal/videos/handler.go`
- `backend/internal/videos/handler_test.go`
- `backend/internal/server/router.go` (the one `NewHandler` callsite)
- `frontend/src/hooks/use-set-videos.ts`
- `frontend/src/hooks/use-set-videos.test.tsx` (plan 001 renamed it from `.ts`)
- `frontend/src/components/workout/day-board.tsx`
- `frontend/src/components/workout/workout-table.tsx`
- `frontend/src/components/workout/video-upload-dialog.tsx`

**Out of scope** (do NOT touch):

- `frontend/src/services/generated/**` — generated; regenerating the typed
  client is a follow-up that needs a running backend.
- `backend/internal/videos/service.go` / `repository.go` — server-side
  enforcement is already correct; this plan only _exposes_ config.
- `backend/cmd/api/main.go` — `VideoLimits` is already always populated.

## Git workflow

- Work on branch `set-video-upload` (committed through `311b632`); edit in
  the working tree. Do NOT commit, push, or open a PR unless the operator
  instructed it.

## Steps

### Step 1: Add the config DTO and handler endpoint

1. In `backend/internal/videos/dto.go` add:

```go
// VideoConfigResponse tells the client whether uploads are available and the
// server-enforced constraints, so the UI never hardcodes them.
type VideoConfigResponse struct {
	Enabled      bool     `json:"enabled"`
	MaxBytes     int64    `json:"max_bytes" example:"524288000"`
	AllowedTypes []string `json:"allowed_types" example:"video/mp4,video/quicktime,video/webm"`
} // @name VideoConfigResponse
```

2. In `backend/internal/videos/handler.go`:
   - Add a `limits Limits` field to `Handler`; change the constructor to
     `NewHandler(service Service, enabled bool, limits Limits, log *slog.Logger)`.
   - Register `rg.GET("/videos/config", h.Config)` in `Register`.
   - Implement `Config` — note it must NOT call `h.guard`; returning the
     config with `enabled: false` is its entire purpose when disabled:

```go
func (h *Handler) Config(c *gin.Context) {
	types := make([]string, 0, len(allowedContentTypes))
	for t := range allowedContentTypes {
		types = append(types, t)
	}
	sort.Strings(types)
	c.JSON(http.StatusOK, VideoConfigResponse{
		Enabled:      h.enabled,
		MaxBytes:     h.limits.MaxBytes,
		AllowedTypes: types,
	})
}
```

Give it the standard swagger block (`@Summary Get video upload capabilities`,
`@Tags Videos`, `@Produce json`, `@Success 200 {object} VideoConfigResponse`,
`@Security BearerAuth`, `@Router /api/videos/config [get]`) matching the
style of `handler.go:95-105`. 3. Update the callsite in `backend/internal/server/router.go:78` to
`videos.NewHandler(videosService, videosEnabled, deps.VideoLimits, deps.Log)`. 4. Update every `NewHandler(` call in `backend/internal/videos/handler_test.go`
(`grep -n "NewHandler(" backend/internal/videos/`) to pass a `Limits` value —
use the existing `testLimits()` helper from `service_test.go:20` (same package).

**Verify**: `cd backend && go build ./...` → exit 0.

### Step 2: Backend tests for the endpoint

In `backend/internal/videos/handler_test.go` add (modeled on
`TestHandler_DisabledReturns503` at line 64):

1. `TestHandlerConfig_DisabledReturns200WithEnabledFalse` —
   `NewHandler(nil, false, testLimits(), silentLogger()).Config(c)`; assert
   status 200 and the JSON body has `"enabled":false` (unmarshal into
   `VideoConfigResponse`).
2. `TestHandlerConfig_EnabledReturnsLimitsAndSortedTypes` — enabled handler;
   assert `Enabled` true, `MaxBytes == testLimits().MaxBytes`, and
   `AllowedTypes == []string{"video/mp4", "video/quicktime", "video/webm"}`
   (sorted order).

**Verify**: `cd backend && go test ./internal/videos/` → all pass.

### Step 3: Frontend — fetch the config

In `frontend/src/hooks/use-set-videos.ts`:

1. Add the type and hook (plain fetch — the generated client doesn't know the
   route yet; replicate the auth setup from `main.tsx`):

```ts
export type VideoConfig = {
  enabled: boolean
  max_bytes: number
  allowed_types: string[]
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""

// useVideoConfig loads the server's video-upload capabilities once per app
// session. Plain fetch (not the generated client) because the typed client is
// only regenerated against a running backend; keep auth identical to main.tsx
// (cookie credentials).
export function useVideoConfig() {
  return useQuery({
    queryKey: ["video-config"],
    staleTime: Infinity,
    queryFn: async (): Promise<VideoConfig> => {
      const res = await fetch(`${API_BASE_URL}/api/videos/config`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error(`video config failed: ${res.status}`)
      return res.json()
    },
  })
}
```

2. Demote the constants to fallbacks and let callers pass server values:

```ts
// Fallbacks for before/without the server config — the server enforces the
// real limits regardless.
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024

export function isAllowedVideoType(type: string, allowed?: string[]): boolean {
  return (allowed ?? (ALLOWED_VIDEO_TYPES as readonly string[])).includes(type)
}
```

**Verify**: `cd frontend && pnpm typecheck` → exit 0.

### Step 4: Frontend — gate the feature on the config

1. `frontend/src/components/workout/day-board.tsx`:
   - `const videoConfig = useVideoConfig()` near the existing
     `useSessionVideos` call.
   - `const videosEnabled = videoConfig.data?.enabled !== false` — i.e.
     optimistic while loading/error, hidden only on an explicit
     `enabled: false`.
   - Gate the video list: `useSessionVideos(videosEnabled ? session?.id : undefined)`
     (the hook already no-ops on `undefined`).
   - Pass `videosEnabled` down to `WorkoutTable` (new prop) and only render
     `VideoUploadDialog` when `videosEnabled`.
2. `frontend/src/components/workout/workout-table.tsx`:
   - Add `videosEnabled: boolean` to `WorkoutTableProps` (it does NOT need to
     go into `WorkoutTableMeta` — visibility is table state, not cell state).
   - Hide the column via TanStack column visibility:
     `useReactTable({ ..., state: { ...existing state if any..., columnVisibility: { video: videosEnabled } } })`.
   - Render the last `<col style={{ width: "3rem" }} />` only when
     `videosEnabled` so the layout doesn't reserve a phantom column.
3. `frontend/src/components/workout/video-upload-dialog.tsx`:
   - `const videoConfig = useVideoConfig()` inside the component (the query is
     cached; no prop drilling needed).
   - In `beginUpload`, validate with the server values:
     `isAllowedVideoType(file.type, videoConfig.data?.allowed_types)` and
     `file.size > (videoConfig.data?.max_bytes ?? MAX_VIDEO_BYTES)`.
   - Replace both hardcoded "500 MB" strings (the error message at ~line 122
     and the drop-zone copy at ~line 266) with a formatted value derived from
     the effective max bytes (reuse the local `fmtBytes` helper; e.g.
     `up to ${fmtBytes(maxBytes)}`). Derive the types string from
     `allowed_types` if present, else keep "MP4, MOV or WebM".

**Verify**: `cd frontend && pnpm typecheck && pnpm lint` → exit 0.

### Step 5: Frontend tests

In the use-set-videos test file:

1. Update the `isAllowedVideoType` tests for the new optional parameter
   (existing behavior unchanged when omitted) and add one case: a custom
   `allowed` list overrides the fallback.
2. Add a `useVideoConfig` test: stub `global.fetch` with `vi.stubGlobal` /
   `vi.spyOn(globalThis, "fetch")` returning
   `new Response(JSON.stringify({ enabled: false, max_bytes: 1, allowed_types: [] }))`,
   render the hook with a `QueryClientProvider` wrapper, and assert
   `result.current.data?.enabled === false` via `waitFor`. (If plan 001 was
   executed, a provider-wrapper pattern already exists in this file — reuse it.)

**Verify**: `cd frontend && pnpm test` → all pass.

## Test plan

- Backend: 2 new handler tests (step 2), modeled on
  `TestHandler_DisabledReturns503`.
- Frontend: extended `isAllowedVideoType` cases + 1 fetch-stubbed
  `useVideoConfig` test (step 5).
- Manual check (optional, needs the dev stack): with the `R2_*` vars unset,
  `GET /api/videos/config` returns `{"enabled":false,...}` and the workout
  table renders without the video column.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && go build ./...` and `go test ./...` exit 0
- [ ] `grep -n "videos/config" backend/internal/videos/handler.go` shows the route
- [ ] `cd frontend && pnpm typecheck && pnpm lint && pnpm test` all exit 0
- [ ] `grep -rn "500 \* 1024 \* 1024" frontend/src --include="*.ts" --include="*.tsx" | grep -v test`
      matches only the fallback constant in `use-set-videos.ts`
- [ ] `grep -n "columnVisibility" frontend/src/components/workout/workout-table.tsx` matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `useReactTable` in `workout-table.tsx` already passes a `state` option that
  conflicts with adding `columnVisibility` (at planning time it passes none).
- The handler's `enabled` flag or `Limits` shape changed since planning.
- You are tempted to regenerate the OpenAPI client to type the new endpoint —
  that requires a running backend and is explicitly deferred.

## Maintenance notes

- Follow-up (deferred): once the backend is running locally, run
  `cd backend && make swagger` then `cd frontend && pnpm api_generate`, and
  replace the hand-written `fetch` in `useVideoConfig` with the generated
  `VideosApi` method. The plain fetch is correct but lives outside the typed
  client's auth configuration, so it must be kept in sync with `main.tsx` until then.
- If `allowedContentTypes` in `service.go` gains a type, the endpoint picks it
  up automatically; the _frontend fallback list_ in `use-set-videos.ts` should
  be updated in the same change.
- Reviewer should scrutinize: `Config` must not call `h.guard` (a 503 here
  would recreate the original bug), and the `videosEnabled !== false` optimism
  means a hard-down backend shows the column — acceptable, since every other
  query is failing then anyway.
