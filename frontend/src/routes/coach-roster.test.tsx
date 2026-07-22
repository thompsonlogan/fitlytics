import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { routerMock } from "@/test/mocks/router-mock"

vi.mock("@tanstack/react-router", () => routerMock)

import { CoachRosterPage } from "@/routes/coach-roster"
import { ServiceContext } from "@/services/context"
import type { CoachAthleteSummaryResponse } from "@/services/generated"
import type { ServiceApis } from "@/services/data"

function row(overrides: Partial<CoachAthleteSummaryResponse> = {}): CoachAthleteSummaryResponse {
  return {
    linkId: "link-1",
    athleteUserId: "athlete-1",
    displayName: "Marcus Webb",
    email: "marcus@example.com",
    programName: "Hypertrophy Block v3",
    currentWeek: 3,
    totalWeeks: 4,
    compliancePct: 75,
    sessionsCompleted: 6,
    sessionsDue: 8,
    avgRpe: 8.5,
    videosWaiting: 2,
    status: "attention",
    ...overrides,
  }
}

function renderRoster(rows: CoachAthleteSummaryResponse[]) {
  const coachApi = { apiCoachAthletesGet: vi.fn().mockResolvedValue(rows) }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider value={{ apis: { coachApi } as unknown as ServiceApis }}>
        <CoachRosterPage />
      </ServiceContext.Provider>
    </QueryClientProvider>
  )

  return { coachApi }
}

describe("CoachRosterPage", () => {
  it("summarises the roster above the table", async () => {
    renderRoster([
      row(),
      row({ athleteUserId: "athlete-2", displayName: "Priya Nair", videosWaiting: 1 }),
    ])

    expect(await screen.findByText("Marcus Webb")).toBeInTheDocument()
    expect(screen.getByText(/2 active programs/)).toBeInTheDocument()
    expect(screen.getByText(/3 videos waiting/)).toBeInTheDocument()
  })

  it("counts a single athlete and a single video in the singular", async () => {
    renderRoster([row({ videosWaiting: 1 })])

    expect(await screen.findByText("Marcus Webb")).toBeInTheDocument()
    expect(screen.getByText(/1 active program · 1 video waiting/)).toBeInTheDocument()
  })

  it("filters by name as the coach types", async () => {
    const user = userEvent.setup()
    renderRoster([row(), row({ athleteUserId: "athlete-2", displayName: "Priya Nair" })])

    await screen.findByText("Marcus Webb")
    await user.type(screen.getByRole("textbox", { name: /filter athletes/i }), "priya")

    expect(screen.getByText("Priya Nair")).toBeInTheDocument()
    expect(screen.queryByText("Marcus Webb")).not.toBeInTheDocument()
  })

  it("matches on program name too, not just the athlete", async () => {
    const user = userEvent.setup()
    renderRoster([
      row(),
      row({ athleteUserId: "athlete-2", displayName: "Priya Nair", programName: "Meet Prep" }),
    ])

    await screen.findByText("Marcus Webb")
    await user.type(screen.getByRole("textbox", { name: /filter athletes/i }), "meet prep")

    expect(screen.getByText("Priya Nair")).toBeInTheDocument()
    expect(screen.queryByText("Marcus Webb")).not.toBeInTheDocument()
  })

  it("narrows to athletes with videos waiting", async () => {
    const user = userEvent.setup()
    renderRoster([
      row(),
      row({ athleteUserId: "athlete-2", displayName: "Priya Nair", videosWaiting: 0 }),
    ])

    await screen.findByText("Priya Nair")
    await user.click(screen.getByRole("tab", { name: "Needs review" }))

    expect(screen.getByText("Marcus Webb")).toBeInTheDocument()
    expect(screen.queryByText("Priya Nair")).not.toBeInTheDocument()
  })

  it("narrows to athletes needing attention", async () => {
    const user = userEvent.setup()
    renderRoster([
      row(),
      row({ athleteUserId: "athlete-2", displayName: "Priya Nair", status: "on-track" }),
    ])

    await screen.findByText("Priya Nair")
    await user.click(screen.getByRole("tab", { name: "Attention" }))

    expect(screen.getByText("Marcus Webb")).toBeInTheDocument()
    expect(screen.queryByText("Priya Nair")).not.toBeInTheDocument()
  })

  it("distinguishes an empty filter result from an empty roster", async () => {
    const user = userEvent.setup()
    renderRoster([row()])

    await screen.findByText("Marcus Webb")
    await user.type(screen.getByRole("textbox", { name: /filter athletes/i }), "nobody")

    expect(screen.getByText("No matches")).toBeInTheDocument()
    expect(screen.queryByText("No athletes yet")).not.toBeInTheDocument()
  })

  it("explains how athletes get linked when the roster is empty", async () => {
    renderRoster([])

    expect(await screen.findByText("No athletes yet")).toBeInTheDocument()
    expect(screen.getByText(/set up out of band/i)).toBeInTheDocument()
  })
})
