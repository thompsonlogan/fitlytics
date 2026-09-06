import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { routerMock } from "@/test/mocks/router-mock"

vi.mock("@tanstack/react-router", () => ({
  ...routerMock,
  useParams: () => ({ athleteId: "athlete-1" }),
}))

import { CoachAthletePage } from "@/routes/coach-athlete"
import { ServiceContext } from "@/services/context"
import type { CoachAthleteSummaryResponse, ProgramResponse } from "@/services/generated"
import type { ServiceApis } from "@/services/data"

// The page opens on the athlete's current position, which it derives from the
// wall clock. Anchoring the program to *today* keeps that position at week 1,
// day 0 no matter when the suite runs — a fixed past date drifts into later
// weeks as time passes (and only passed locally because a sibling test's fake
// timers happened to freeze the clock first).
const pad = (n: number) => String(n).padStart(2, "0")
const now = new Date()
const START_DATE = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

function rosterRow(
  overrides: Partial<CoachAthleteSummaryResponse> = {}
): CoachAthleteSummaryResponse {
  return {
    linkId: "link-1",
    athleteUserId: "athlete-1",
    displayName: "Marcus Webb",
    programId: "program-1",
    programName: "Hypertrophy Block v3",
    currentWeek: 1,
    totalWeeks: 2,
    status: "on-track",
    ...overrides,
  }
}

function program(): ProgramResponse {
  const days = (weekSeq: number) =>
    Array.from({ length: 7 }, (_, i) => ({
      id: `w${weekSeq}d${i + 1}`,
      name: i === 0 ? "Lower A" : `Day ${i + 1}`,
      tag: `D${i + 1}`,
      sequence: i + 1,
      exercises: [],
    }))

  return {
    id: "program-1",
    name: "Hypertrophy Block v3",
    startDate: START_DATE,
    blocks: [
      {
        id: "block-1",
        sequence: 1,
        name: "Block 1",
        weeks: [
          { id: "week-1", sequence: 1, days: days(1) },
          { id: "week-2", sequence: 2, days: days(2) },
        ],
      },
    ],
  }
}

function renderPage(rows: CoachAthleteSummaryResponse[]) {
  const coachApi = { apiCoachAthletesGet: vi.fn().mockResolvedValue(rows) }
  const programsApi = { apiProgramsIdGet: vi.fn().mockResolvedValue(program()) }
  const sessionsApi = { apiProgramsIdDayCompletionsGet: vi.fn().mockResolvedValue([]) }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider
        value={{ apis: { coachApi, programsApi, sessionsApi } as unknown as ServiceApis }}
      >
        <CoachAthletePage />
      </ServiceContext.Provider>
    </QueryClientProvider>
  )

  return { coachApi, programsApi }
}

describe("CoachAthletePage", () => {
  it("shows the athlete and their program in the breadcrumb", async () => {
    renderPage([rosterRow()])

    await screen.findAllByRole("tab")

    const crumbs = screen.getByRole("navigation", { name: /breadcrumb/i })
    expect(within(crumbs).getByText("Marcus Webb")).toBeInTheDocument()
    expect(within(crumbs).getByRole("link", { name: "Athletes" })).toHaveAttribute(
      "href",
      "/coach"
    )
    expect(within(crumbs).getByText("Hypertrophy Block v3")).toBeInTheDocument()
  })

  it("steps through the program's weeks", async () => {
    const user = userEvent.setup()
    renderPage([rosterRow()])

    await screen.findAllByRole("tab")
    expect(screen.getByText("Week 1")).toBeInTheDocument()

    await user.click(screen.getByTitle("Next week"))
    expect(screen.getByText("Week 2")).toBeInTheDocument()
  })

  it("stops at the last week", async () => {
    const user = userEvent.setup()
    renderPage([rosterRow()])

    await screen.findAllByRole("tab")
    await user.click(screen.getByTitle("Next week"))

    expect(screen.getByTitle("Next week")).toBeDisabled()
  })

  it("selects a different day without touching the week", async () => {
    const user = userEvent.setup()
    renderPage([rosterRow()])

    const days = await screen.findAllByRole("tab")
    await user.click(days[3]!)

    expect(days[3]!).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("Week 1")).toBeInTheDocument()
  })

  it("does not confirm the athlete exists when there is no link", async () => {
    const { programsApi } = renderPage([])

    expect(await screen.findByText("Athlete not found")).toBeInTheDocument()
    expect(programsApi.apiProgramsIdGet).not.toHaveBeenCalled()
  })

  it("explains an athlete with no program instead of rendering an empty shell", async () => {
    renderPage([rosterRow({ programId: undefined, programName: undefined })])

    expect(await screen.findByText(/Marcus Webb has no program/)).toBeInTheDocument()
  })
})
