import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import {
  PROGRAM_QUERY_KEY,
  fetchActiveProgram,
  useWorkoutProgram,
} from "./use-workout-program"
import { ServiceContext } from "@/services/context"
import type {
  ProgramResponse,
  ProgramSummaryResponse,
  ProgramsApi,
} from "@/services/generated"

// fakeProgramsApi lets each test stub out the two endpoints we touch without
// pulling in the real BaseAPI machinery (which would need fetch globals).
// Cast through `unknown` because we only implement the methods under test.
function fakeProgramsApi(overrides: {
  list?: () => Promise<ProgramSummaryResponse[]>
  get?: (id: string) => Promise<ProgramResponse>
}): ProgramsApi {
  return {
    apiProgramsGet: overrides.list ?? (() => Promise.resolve([])),
    apiProgramsIdGet: ({ id }: { id: string }) =>
      (overrides.get ?? (() => Promise.resolve({}) as Promise<ProgramResponse>))(id),
  } as unknown as ProgramsApi
}

function wrapper(api: ProgramsApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider value={{ apis: { authApi: {} as never, programsApi: api } }}>
        {children}
      </ServiceContext.Provider>
    </QueryClientProvider>
  )
}

// ─── fetchActiveProgram (pure-ish data loader) ─────────────────────────────

describe("fetchActiveProgram", () => {
  it("fetches the summary list, picks the first id, then loads its tree", async () => {
    const list = vi.fn().mockResolvedValue([
      { id: "first-id", name: "Logan PL" },
      { id: "second-id", name: "Other" },
    ])
    const get = vi.fn().mockResolvedValue({
      id: "first-id",
      name: "Logan PL",
      weeks: [],
    })

    const api = fakeProgramsApi({ list, get })

    const result = await fetchActiveProgram(api)

    expect(list).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledWith("first-id")
    expect(result.name).toBe("Logan PL")
  })

  it("throws when the user has no programs (auth-gated misconfig)", async () => {
    const api = fakeProgramsApi({ list: () => Promise.resolve([]) })
    await expect(fetchActiveProgram(api)).rejects.toThrow(/no programs/i)
  })

  it("throws when a summary is missing an id (defensive)", async () => {
    const api = fakeProgramsApi({
      list: () => Promise.resolve([{ name: "anon" }] as ProgramSummaryResponse[]),
    })
    await expect(fetchActiveProgram(api)).rejects.toThrow(/no programs/i)
  })
})

// ─── useWorkoutProgram (React Query integration) ───────────────────────────

describe("useWorkoutProgram", () => {
  it("exposes isLoading=true on first render, then data once the fetch resolves", async () => {
    const api = fakeProgramsApi({
      list: () => Promise.resolve([{ id: "p", name: "Prog" }]),
      get: () =>
        Promise.resolve({
          id: "p",
          name: "Prog",
          weeks: [{ id: "w", sequence: 1, days: [] }],
        }),
    })

    const { result } = renderHook(() => useWorkoutProgram(), {
      wrapper: wrapper(api),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data?.name).toBe("Prog")
    expect(result.current.data?.weeks).toHaveLength(1)
  })

  it("surfaces a thrown loader error as isError", async () => {
    const api = fakeProgramsApi({
      list: () => Promise.reject(new Error("boom")),
    })

    const { result } = renderHook(() => useWorkoutProgram(), {
      wrapper: wrapper(api),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })

  it("uses a stable query key so cache invalidation has a single target", () => {
    expect(PROGRAM_QUERY_KEY).toEqual(["program", "active"])
  })
})
