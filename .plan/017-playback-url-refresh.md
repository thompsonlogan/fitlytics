# Plan 017: Refresh expired video playback URLs instead of showing the codec warning

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/components/workout/use-video-upload.ts frontend/src/components/workout/video-media-region.tsx frontend/src/components/workout/video-upload-dialog.tsx frontend/src/components/workout/use-video-upload.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — adds a one-shot refresh path in front of the existing
  error UI; the format-warning behavior is unchanged for genuine decode
  failures.
- **Depends on**: none
- **Category**: bug (UX)
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

Saved-clip playback uses presigned R2 GET URLs with a **6-hour TTL**
(`backend/internal/videos/service.go:21` `playbackURLTTL = 6 * time.Hour`).
When a cached URL outlives that (long-lived tab, dialog opened much later),
the `<video>` element fires `onError` and the UI shows the HEVC/codec
warning — a wrong diagnosis for an expired signature, and a dead end even
though the real fix is one refetch away (the list endpoint presigns fresh
URLs on every request). This plan makes the first playback error trigger a
silent one-shot refetch; only if the **fresh** URL also fails does the
format warning appear (that's a genuine decode problem).

## Current state

- `frontend/src/components/workout/use-video-upload.ts` — owns the dialog
  state, including the errored-source tracking (lines 58–61):

```ts
  // The last source whose <video> failed to decode. Compared against the
  // current src (not a bare boolean) so it self-clears when the source changes
  // — no effect needed to reset it.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
```

  It returns `erroredSrc` and `setErroredSrc` (lines 213–214) and already
  knows `sessionId` (prop) and `currentVideo` (derived, line 77).

- `frontend/src/components/workout/video-media-region.tsx` — two `<video>`
  players call `setErroredSrc` on error:
  - the **staged** local-blob preview (line 83: `onError={() => setErroredSrc(staged.url)}`) — a decode failure here IS a format problem (the bytes are local; expiry is impossible) and must keep its current behavior;
  - the **saved** clip (line 120: `onError={() => setErroredSrc(currentVideo.playbackUrl!)}`) — this is the one to change.
  Both players use `key={...url}` so a URL change remounts the element, and
  the `FormatWarning` renders only when `erroredSrc === <current src>`
  (lines 91, 125) — so a refreshed URL automatically clears a stale warning.

- `frontend/src/components/workout/video-upload-dialog.tsx` — thin view that
  plumbs the hook's return values into `VideoMediaRegion` (per its own
  comment, "all state and handlers live in VideoUploadDialog").

- The refetch target: `sessionVideosQueryKey(sessionId)` from
  `frontend/src/hooks/use-set-videos.ts:28`; the backend's `ListForSession`
  presigns a fresh playback URL per row on every request
  (`backend/internal/videos/service.go:202–220`).

- Existing tests: `frontend/src/components/workout/use-video-upload.test.tsx`
  (10 tests) — the structural pattern (and presumably a
  QueryClientProvider/ServiceContext wrapper) for the new cases.

## Commands you will need

| Purpose   | Command (run in `frontend/`)          | Expected on success |
|-----------|----------------------------------------|---------------------|
| This test | `pnpm vitest run use-video-upload`     | all pass            |
| All tests | `pnpm test`                            | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`    | exit 0              |

## Scope

**In scope**:
- `frontend/src/components/workout/use-video-upload.ts`
- `frontend/src/components/workout/video-media-region.tsx`
- `frontend/src/components/workout/video-upload-dialog.tsx` (prop plumbing)
- `frontend/src/components/workout/use-video-upload.test.tsx`

**Out of scope** (do NOT touch):
- The staged-preview error path (local blob — current behavior is correct).
- Backend TTLs or the ListForSession presign logic.
- `FormatWarning` copy/component.
- The table-level `videoInfo` indicator (`use-day-board.ts`).

## Git workflow

- Branch: `advisor/017-playback-url-refresh`
- Commit style: `fix(frontend): refresh expired playback URLs before showing the format warning`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the one-shot refresh handler to the hook

In `use-video-upload.ts`:

1. Import `useQueryClient` from `@tanstack/react-query`, `useRef` (already
   imported), and `sessionVideosQueryKey` from `@/hooks/use-set-videos`.
2. Inside `useVideoUpload`, add:

```ts
  const queryClient = useQueryClient()
  // Video ids we've already tried to refresh once. A playback error on a clip
  // NOT in this set is treated as a possibly-expired presigned URL: refetch
  // the list (which presigns fresh URLs) instead of blaming the codec. A
  // second error on the SAME clip means the fresh URL also failed — that's a
  // genuine decode problem, surface the format warning. Ref, not state: no
  // render depends on it.
  const refreshedIdsRef = useRef<Set<string>>(new Set())

  // handlePlaybackError handles errors from the SAVED clip player only (the
  // staged local-blob preview keeps calling setErroredSrc directly — a local
  // decode failure can't be an expiry).
  function handlePlaybackError(src: string) {
    const vid = currentVideo
    if (vid?.id && sessionId && !refreshedIdsRef.current.has(vid.id)) {
      refreshedIdsRef.current.add(vid.id)
      void queryClient.invalidateQueries({ queryKey: sessionVideosQueryKey(sessionId) })
      return
    }
    setErroredSrc(src)
  }
```

3. Return `handlePlaybackError` from the hook (alongside the existing
   `erroredSrc`/`setErroredSrc`).

Why this works with no further wiring: the invalidation refetches the session
videos, the fresh `playbackUrl` flows into `currentVideo`, the `key` remount
retries playback automatically, and `FormatWarning`'s
`erroredSrc === <current src>` comparison keeps any previously-set warning
hidden for the new URL.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Route the saved player's error through it

1. `video-media-region.tsx`: add `onPlaybackError: (src: string) => void` to
   `VideoMediaRegionProps`; change ONLY the saved player's handler
   (line 120) to `onError={() => onPlaybackError(currentVideo.playbackUrl!)}`.
   The staged player (line 83) keeps `setErroredSrc`.
2. `video-upload-dialog.tsx`: pass `onPlaybackError={handlePlaybackError}`
   through from the hook's return to `<VideoMediaRegion …>`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 3: Tests

Add to `use-video-upload.test.tsx`, following its existing wrapper/harness
(spy on the query client via
`const spy = vi.spyOn(queryClient, "invalidateQueries")` using the same
QueryClient instance the wrapper provides):

1. **First error → silent refresh**: with a ready `currentVideo` and a
   `sessionId`, call `handlePlaybackError(url)` → `invalidateQueries` called
   once with `sessionVideosQueryKey(sessionId)`, and `erroredSrc` stays
   `null`.
2. **Second error, same video → warning**: call it again →
   `invalidateQueries` NOT called again; `erroredSrc === url`.
3. **No sessionId** (defensive): `handlePlaybackError(url)` sets `erroredSrc`
   immediately, no invalidation.
4. **Different video id resets the budget**: after case 2, point
   `currentVideo` at a different id (re-render the hook with different
   `videosBySetLogId`/`initialSet` per the harness) → its first error
   refreshes again.

If the existing harness makes case 4 awkward (it requires swapping derived
`currentVideo`), it may be dropped with a comment — cases 1–3 are the gate.

**Verify**: `pnpm vitest run use-video-upload` → all pass (10 existing + ≥ 3
new).

### Step 4: Full pass

**Verify**: `pnpm test`, `pnpm lint`, `pnpm typecheck` → all exit 0.

## Test plan

Step 3's cases in the existing test file. No new files.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] The saved player's `onError` in `video-media-region.tsx` calls `onPlaybackError`; the staged player's still calls `setErroredSrc` (grep both lines)
- [ ] `pnpm vitest run use-video-upload` → ≥ 13 tests pass, including the silent-refresh and second-error cases
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `.plan/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The current excerpts don't match (in particular, if someone already
  changed the `onError` wiring).
- The existing test harness can't reach the hook's returned
  `handlePlaybackError` (e.g. it only tests through the rendered dialog) —
  report the harness shape rather than rebuilding it.
- You find yourself adding retry loops or timers — the design is strictly
  one refresh per video id per dialog lifetime; anything more is scope
  creep.

## Maintenance notes

- If `playbackURLTTL` is ever shortened server-side, this path gets exercised
  more often — the one-shot budget per video id (per dialog mount) is still
  correct because each refetch issues a fresh 6-hour URL.
- A nicer future signal: the backend could return `expires_at` alongside
  `playback_url` so the client refreshes proactively; deferred as not worth a
  contract change for the current failure rate.
- Reviewer scrutiny: confirm the staged-preview path is untouched (local
  blobs must warn immediately) and that no `useEffect` crept in (repo
  convention).
