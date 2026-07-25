import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { useCoachSession } from "@/hooks/use-coach-session"
import { ServiceContext } from "@/services/context"
import type { ServiceApis } from "@/services/data"
import type { SessionResponse, SetLogResponse } from "@/services/generated"

const GROUP = "group-1"

function log(overrides: Partial<SetLogResponse> = {}): SetLogResponse {
  return {
    id: `log-${Math.random()}`,
    groupId: GROUP,
    state: "completed",
    actualLoadKg: 100,
    actualRpe: 8,
    repsActual: 5,
    ...overrides,
  } as SetLogResponse
}

function renderCoachSession(logs: SetLogResponse[], videos: unknown[] | "error" = []) {
  const session = {
    id: "session-1",
    exercises: [{ setLogs: logs }],
  } as unknown as SessionResponse

  const sessionsApi = {
    apiProgramsIdDaysDayIdSessionsCurrentGet: vi.fn().mockResolvedValue(session),
  }
  const videosApi = {
    apiSessionsSessionIdVideosGet:
      videos === "error"
        ? vi.fn().mockRejectedValue(new Error("boom"))
        : vi.fn().mockResolvedValue(videos),
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider
        value={{ apis: { sessionsApi, videosApi } as unknown as ServiceApis }}
      >
        {children}
      </ServiceContext.Provider>
    </QueryClientProvider>
  )

  return renderHook(() => useCoachSession("program-1", "day-1"), { wrapper })
}

describe("useCoachSession", () => {
  it("collapses a fully completed block", async () => {
    const { result } = renderCoachSession([log(), log()])

    await waitFor(() => expect(result.current.actualsFor("0-0").state).toBe("completed"))
  })

  it("reports a mixed block as partial rather than pending", async () => {
    const { result } = renderCoachSession([log(), log({ state: "skipped", actualRpe: undefined })])

    await waitFor(() => expect(result.current.actualsFor("0-0").state).toBe("partial"))
  })

  it("reports a wholly skipped block as skipped", async () => {
    const { result } = renderCoachSession([
      log({ state: "skipped" }),
      log({ state: "skipped" }),
    ])

    await waitFor(() => expect(result.current.actualsFor("0-0").state).toBe("skipped"))
  })

  // A skipped final set carries no RPE; falling back to the last *reported*
  // value keeps ratings the athlete did give from vanishing.
  it("keeps the last reported RPE when the final set was skipped", async () => {
    const { result } = renderCoachSession([
      log({ actualRpe: 8 }),
      log({ actualRpe: 9 }),
      log({ state: "skipped", actualRpe: undefined, actualLoadKg: undefined }),
    ])

    await waitFor(() => expect(result.current.actualsFor("0-0").rpe).toBe(9))
  })

  it("reports no RPE when the athlete never rated a set", async () => {
    const { result } = renderCoachSession([log({ actualRpe: undefined })])

    await waitFor(() => expect(result.current.actualsFor("0-0").rpe).toBeNull())
  })

  it("counts only ready videos, splitting out the unreviewed ones", async () => {
    const logs = [log({ id: "a" }), log({ id: "b" }), log({ id: "c" })]
    const { result } = renderCoachSession(logs, [
      { setLogId: "a", status: "ready", reviewedAt: "2026-07-01T00:00:00Z" },
      { setLogId: "b", status: "ready" },
      { setLogId: "c", status: "uploading" },
    ])

    await waitFor(() => expect(result.current.actualsFor("0-0").videosTotal).toBe(2))
    expect(result.current.actualsFor("0-0").videosUnreviewed).toBe(1)
  })

  it("returns empty actuals for a block with no logs at all", async () => {
    const { result } = renderCoachSession([log()])

    await waitFor(() => expect(result.current.actualsFor("0-0").state).toBe("completed"))
    expect(result.current.actualsFor("9-9")).toMatchObject({ state: "pending", loadLb: null })
  })

  // A failed video request must not read as "no footage" — the page relies on
  // videosError to tell the coach the counts are unreliable.
  it("reports a video-list failure instead of swallowing it", async () => {
    const { result } = renderCoachSession([log()], "error")

    await waitFor(() => expect(result.current.videosError).toBe(true))
    // The counts fall back to zero, which is exactly why the error must surface.
    expect(result.current.actualsFor("0-0").videosTotal).toBe(0)
  })
})
