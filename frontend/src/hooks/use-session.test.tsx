import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

import { countPending, sessionQueryKey, useLogSet } from "./use-session"
import { dayCompletionsQueryKey } from "./use-day-completions"
import { ServiceContext } from "@/services/context"
import type { ServiceApis } from "@/services/data"
import type { SessionResponse, SessionExerciseResponse, SetLogResponse, SessionsApi } from "@/services/generated"

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeSetLog(id: string, state?: string): SetLogResponse {
  return { id, state }
}

function makeSession(id: string, exercises: SessionExerciseResponse[]): SessionResponse {
  return { id, exercises }
}

function makeExercise(setLogs: SetLogResponse[]): SessionExerciseResponse {
  return { id: "ex-1", setLogs }
}

function makeWrapper(queryClient: QueryClient, sessionsApi: SessionsApi) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider
        value={{
          apis: {
            sessionsApi,
            authApi: {} as never,
            coachApi: {} as never,
            programsApi: {} as never,
            videosApi: {} as never,
          } as ServiceApis,
        }}
      >
        {children}
      </ServiceContext.Provider>
    </QueryClientProvider>
  )
}

// ─── countPending unit tests ───────────────────────────────────────────────────

describe("countPending", () => {
  it("counts set logs in 'pending' state across all exercises", () => {
    const session = makeSession("s1", [
      makeExercise([
        makeSetLog("l1", "pending"),
        makeSetLog("l2", "completed"),
        makeSetLog("l3", "pending"),
      ]),
    ])

    expect(countPending(session)).toBe(2)
  })

  it("returns 0 for a null session", () => {
    expect(countPending(null)).toBe(0)
  })

  it("returns 0 for an undefined session", () => {
    expect(countPending(undefined)).toBe(0)
  })

  it("treats a set log with undefined state as pending (the ?? 'pending' default)", () => {
    const session = makeSession("s1", [
      makeExercise([
        makeSetLog("l1"),          // state undefined → counts as pending
        makeSetLog("l2", "skipped"),
      ]),
    ])

    expect(countPending(session)).toBe(1)
  })

  it("returns 0 when all set logs are terminal (completed or skipped)", () => {
    const session = makeSession("s1", [
      makeExercise([
        makeSetLog("l1", "completed"),
        makeSetLog("l2", "skipped"),
      ]),
    ])

    expect(countPending(session)).toBe(0)
  })
})

// ─── useLogSet boundary invalidation ─────────────────────────────────────────

describe("useLogSet invalidation boundary", () => {
  it("invalidates day-completions when pending count crosses 1 → 0", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.spyOn(queryClient, "invalidateQueries")

    // Seed a session with exactly one pending set log
    const pendingLog = makeSetLog("log-1", "pending")
    const session = makeSession("session-abc", [makeExercise([pendingLog])])
    queryClient.setQueryData(sessionQueryKey("p", "d"), session)

    // The PATCH resolves with the same log now marked completed
    const updatedLog: SetLogResponse = { id: "log-1", state: "completed" }
    const fakeSessionsApi: Partial<SessionsApi> = {
      apiSessionsSessionIdSetLogsSetLogIdPatch: vi.fn().mockResolvedValue(updatedLog),
    }

    const wrapper = makeWrapper(queryClient, fakeSessionsApi as unknown as SessionsApi)
    const { result } = renderHook(() => useLogSet("p", "d"), { wrapper })

    result.current.mutate({ setLogId: "log-1", body: { state: "completed" } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: dayCompletionsQueryKey("p"),
    })
  })

  it("does not invalidate day-completions when body has no state (non-state edit)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.spyOn(queryClient, "invalidateQueries")

    // Seed a session with one pending log
    const pendingLog = makeSetLog("log-1", "pending")
    const session = makeSession("session-abc", [makeExercise([pendingLog])])
    queryClient.setQueryData(sessionQueryKey("p", "d"), session)

    // PATCH updates a weight, not the state
    const updatedLog: SetLogResponse = { id: "log-1", state: "pending", actualLoadKg: 100 }
    const fakeSessionsApi: Partial<SessionsApi> = {
      apiSessionsSessionIdSetLogsSetLogIdPatch: vi.fn().mockResolvedValue(updatedLog),
    }

    const wrapper = makeWrapper(queryClient, fakeSessionsApi as unknown as SessionsApi)
    const { result } = renderHook(() => useLogSet("p", "d"), { wrapper })

    result.current.mutate({ setLogId: "log-1", body: { actualLoadKg: 100 } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  })
})
