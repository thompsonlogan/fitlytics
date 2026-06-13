# Plan 001: Invalidate the session-video cache even when an upload fails

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: This plan was written against **uncommitted**
> work on branch `set-video-upload` (HEAD was `eb95537`, but the relevant code
> exists only in the working tree). Verify the "Current state" excerpts below
> match the live files before proceeding. If `frontend/src/hooks/use-set-videos.ts`
> does not exist, the feature branch is not present — STOP.
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

When a user replaces a set's video, the backend's "reserve upload" step
(`POST /api/sessions/{id}/set-logs/{id}/videos`) **immediately soft-deletes the
old video row and purges the old object from storage** — before the browser has
uploaded a single byte. If the subsequent direct PUT to storage or the finalize
call then fails, the frontend's React Query cache is never invalidated (it only
invalidates `onSuccess`), so the UI keeps showing the old clip as present and
playable even though it no longer exists server-side. The user believes their
old video is safe; it is gone. Invalidating on settle (success _or_ failure)
makes the UI reconcile to server truth in every outcome.

## Current state

- `frontend/src/hooks/use-set-videos.ts` — all video hooks. The upload
  mutation at lines 90–121 reads:

```ts
// use-set-videos.ts:90-121
export function useUploadSetVideo() {
  const { videosApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: UploadSetVideoVars): Promise<VideoResponse> => {
      const created: CreateVideoUploadResponse =
        await videosApi.apiSessionsSessionIdSetLogsSetLogIdVideosPost({
          ...
        })

      if (!created.upload || !created.video?.id) {
        throw new Error("upload was not reserved")
      }

      await putToStorage(created.upload, vars.file, vars.onProgress)

      return videosApi.apiVideosVideoIdFinalizePost({ videoId: created.video.id })
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: sessionVideosQueryKey(vars.sessionId) })
    },
  })
}
```

- The server-side eager purge this plan compensates for is in
  `backend/internal/videos/service.go:103-109` (purge of the replaced object
  right after the DB row swap commits) — do not change it; the ordering there
  is intentional (a leaked object is recoverable, a committed row swap is not).
- The cache key helper is `sessionVideosQueryKey(sessionId)` at
  `use-set-videos.ts:21-22`.
- Repo conventions: hooks live in `frontend/src/hooks/`, tests alongside as
  `*.test.ts`, Vitest + Testing Library (see `frontend/src/hooks/use-set-videos.test.ts`
  for the existing test file to extend). No `useEffect` anywhere.

## Commands you will need

| Purpose   | Command (run in `frontend/`) | Expected on success |
| --------- | ---------------------------- | ------------------- |
| Typecheck | `pnpm typecheck`             | exit 0, no errors   |
| Tests     | `pnpm test`                  | all pass            |
| Lint      | `pnpm lint`                  | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `frontend/src/hooks/use-set-videos.ts`
- `frontend/src/hooks/use-set-videos.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `backend/internal/videos/service.go` — the eager purge order is intentional.
- `frontend/src/components/workout/video-upload-dialog.tsx` — its generic
  error toast is fine; the cache fix makes the displayed state correct.
- `useDeleteSetVideo` / `useUpdateVideoNote` in the same file — their server
  calls are atomic; a failed delete/patch changes nothing server-side, so
  `onSuccess` is correct for them.

## Git workflow

- The feature branch `set-video-upload` is uncommitted; make your edits in
  place on that working tree. Do NOT commit, push, or open a PR unless the
  operator instructed it.

## Steps

### Step 1: Switch the upload mutation to `onSettled`

In `frontend/src/hooks/use-set-videos.ts`, replace the `onSuccess` handler of
`useUploadSetVideo` (lines 117–119) with an `onSettled` handler. TanStack
Query's `onSettled` signature is `(data, error, variables) => void`:

```ts
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: sessionVideosQueryKey(vars.sessionId) })
    },
```

Add a one-line comment above it explaining the _constraint_ (not the change),
e.g.: reserving an upload replaces the previous video server-side before the
bytes move, so the list must be refetched even when the upload fails.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add a regression test

In `frontend/src/hooks/use-set-videos.test.ts`, add a test that renders
`useUploadSetVideo` with a failing upload and asserts the session-video query
is invalidated. Pattern:

- Build a `QueryClient`, spy on it: `vi.spyOn(queryClient, "invalidateQueries")`.
- Provide a fake services bundle through the real provider:
  `ServiceContext.Provider` from `@/services/context` expects
  `{ apis: { videosApi: ... } }` (see `frontend/src/services/context.ts:12` and
  `frontend/src/services/data.ts` for the `ServiceApis` shape — only
  `videosApi` is consumed by this hook, so cast a partial:
  `{ apis: { videosApi: fakeVideosApi } as unknown as ServiceApis }`).
- Make the reserve call fail _before_ any XHR happens so no network mocking is
  needed: have `apiSessionsSessionIdSetLogsSetLogIdVideosPost` resolve to `{}`
  (no `upload`/`video`), which makes the mutation throw `"upload was not reserved"`.
- Wrapper:

```tsx
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <ServiceContext.Provider value={services}>{children}</ServiceContext.Provider>
  </QueryClientProvider>
)
```

- `renderHook(() => useUploadSetVideo(), { wrapper })`, call
  `result.current.mutateAsync({ sessionId: "s1", setLogId: "l1", file: new File(["x"], "a.mp4", { type: "video/mp4" }) })`,
  expect it to reject, then assert
  `invalidateQueries` was called with `{ queryKey: ["session-videos", "s1"] }`.
- Note: the test file is currently `.ts` with no JSX. Either rename it to
  `use-set-videos.test.tsx` or create the wrapper with `createElement`. Renaming
  to `.tsx` is the cleaner option and Vitest picks it up automatically.

**Verify**: `pnpm test` → all pass, including the new test.

## Test plan

- New test: "invalidates the session video list even when the upload fails"
  (described in Step 2). The existing pure-helper tests in the file stay.
- Verification: `pnpm test` → all pass (was 54 tests before this plan; expect ≥55).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd frontend && pnpm typecheck` exits 0
- [ ] `cd frontend && pnpm test` exits 0 with the new failure-path test present
- [ ] `grep -n "onSuccess" frontend/src/hooks/use-set-videos.ts` shows NO match
      inside `useUploadSetVideo` (the delete/note hooks keep theirs)
- [ ] `cd frontend && pnpm lint` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `useUploadSetVideo` in the live file no longer matches the excerpt (someone
  already restructured the mutation).
- The test cannot reach the provider (e.g. `ServiceContext` is not exported
  from `@/services/context`) — do not refactor the context to make it
  exportable; report instead. (At planning time it IS exported.)
- `pnpm test` fails on tests unrelated to this change.

## Maintenance notes

- If a retry flow is ever added to the dialog (re-attempt the PUT with the
  same presigned URL), this invalidation will refetch mid-flow; revisit then.
- Reviewer should confirm `useDeleteSetVideo`/`useUpdateVideoNote` were NOT
  switched to `onSettled` — for them failure means "nothing changed", and an
  extra refetch would mask real errors.
