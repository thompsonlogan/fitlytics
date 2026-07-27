import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

import { useDayCompletions } from "./use-day-completions"
import { ServiceContext } from "@/services/context"
import type { ServiceApis } from "@/services/data"
import type { SessionsApi } from "@/services/generated"
import { queryKeys } from "@/services/query-keys"

function fakeSessionsApi(
  rows: { weekSequence?: number | null; daySequence?: number | null }[]
): SessionsApi {
  return {
    apiProgramsIdDayCompletionsGet: vi.fn().mockResolvedValue(rows),
  } as unknown as SessionsApi
}

function wrapper(sessionsApi: SessionsApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider
        value={{ apis: { sessionsApi, authApi: {} as never, coachApi: {} as never, coachingApi: {} as never, programsApi: {} as never, videosApi: {} as never } as ServiceApis }}
      >
        {children}
      </ServiceContext.Provider>
    </QueryClientProvider>
  )
}

describe("useDayCompletions", () => {
  it("translates 1-based daySequence to 0-based day index in the record key", async () => {
    const api = fakeSessionsApi([
      { weekSequence: 4, daySequence: 2 },
      { weekSequence: 1, daySequence: 1 },
    ])

    const { result } = renderHook(() => useDayCompletions("p1"), {
      wrapper: wrapper(api),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({ "4-1": true, "1-0": true })
  })

  it("skips rows where daySequence is null", async () => {
    const api = fakeSessionsApi([
      { weekSequence: 2, daySequence: null },
      { weekSequence: 3, daySequence: 1 },
    ])

    const { result } = renderHook(() => useDayCompletions("p2"), {
      wrapper: wrapper(api),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Only the row with non-null sequences survives
    expect(result.current.data).toEqual({ "3-0": true })
  })

  it("skips rows where weekSequence is null", async () => {
    const api = fakeSessionsApi([
      { weekSequence: null, daySequence: 1 },
      { weekSequence: 1, daySequence: 2 },
    ])

    const { result } = renderHook(() => useDayCompletions("p3"), {
      wrapper: wrapper(api),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({ "1-1": true })
  })

  it("returns an empty record when rows array is empty", async () => {
    const api = fakeSessionsApi([])

    const { result } = renderHook(() => useDayCompletions("p4"), {
      wrapper: wrapper(api),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({})
  })

  it("uses the expected stable day-completions key shape", () => {
    expect(queryKeys.dayCompletions.byProgram("prog-1")).toEqual(["day-completions", "prog-1"])
  })
})
