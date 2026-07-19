import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { RosterTable } from "@/components/coach/roster-table"
import type { RosterAthlete } from "@/hooks/use-coach-roster"

function athlete(overrides: Partial<RosterAthlete> = {}): RosterAthlete {
  return {
    linkId: "link-1",
    athleteUserId: "athlete-1",
    displayName: "Marcus Webb",
    email: "marcus@example.com",
    programId: "program-1",
    programName: "Hypertrophy Block v3",
    currentWeek: 3,
    totalWeeks: 4,
    compliancePct: 75,
    sessionsCompleted: 6,
    sessionsDue: 8,
    avgRpe: 8.5,
    lastSessionAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    videosWaiting: 2,
    status: "attention",
    ...overrides,
  }
}

describe("RosterTable", () => {
  it("renders an athlete's summary", () => {
    render(<RosterTable athletes={[athlete()]} />)

    expect(screen.getByText("Marcus Webb")).toBeInTheDocument()
    expect(screen.getByText("Hypertrophy Block v3")).toBeInTheDocument()
    expect(screen.getByText("W3/4")).toBeInTheDocument()
    expect(screen.getByText("75%")).toBeInTheDocument()
    expect(screen.getByText("6/8")).toBeInTheDocument()
    expect(screen.getByText("8.5")).toBeInTheDocument()
    expect(screen.getByText("Yesterday")).toBeInTheDocument()
    expect(screen.getByText("Attention")).toBeInTheDocument()
  })

  it("shows a dash rather than 0% when nothing was due", () => {
    render(
      <RosterTable
        athletes={[athlete({ compliancePct: null, sessionsCompleted: 0, sessionsDue: 0 })]}
      />
    )

    expect(screen.queryByText("0%")).not.toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("handles an athlete with no program", () => {
    render(
      <RosterTable
        athletes={[
          athlete({ programName: undefined, currentWeek: 0, totalWeeks: 0, status: "new" }),
        ]}
      />
    )

    expect(screen.getByText("No program")).toBeInTheDocument()
    expect(screen.getByText("New")).toBeInTheDocument()
  })

  it("renders never-trained athletes without a bogus date", () => {
    render(<RosterTable athletes={[athlete({ lastSessionAt: null, avgRpe: null })]} />)

    expect(screen.getByText("Never")).toBeInTheDocument()
  })

  it("falls back to the raw value for an unknown status", () => {
    render(<RosterTable athletes={[athlete({ status: "deload" })]} />)

    expect(screen.getByText("deload")).toBeInTheDocument()
  })

  it("renders one row per athlete", () => {
    render(
      <RosterTable
        athletes={[athlete(), athlete({ athleteUserId: "athlete-2", displayName: "Priya Nair" })]}
      />
    )

    const rows = within(screen.getByRole("table")).getAllByRole("row")
    expect(rows).toHaveLength(3)
  })
})
