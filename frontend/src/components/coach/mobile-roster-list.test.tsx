import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { routerMock } from "@/test/mocks/router-mock"

vi.mock("@tanstack/react-router", () => routerMock)

import { MobileRosterList } from "@/components/coach/mobile-roster-list"
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

describe("MobileRosterList", () => {
  it("carries the same summary the table row does", () => {
    render(<MobileRosterList athletes={[athlete()]} />)

    expect(screen.getByText("Marcus Webb")).toBeInTheDocument()
    expect(screen.getByText("marcus@example.com")).toBeInTheDocument()
    expect(screen.getByText("Hypertrophy Block v3")).toBeInTheDocument()
    expect(screen.getByText("W3/4")).toBeInTheDocument()
    expect(screen.getByText("75%")).toBeInTheDocument()
    expect(screen.getByText("6/8")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("Yesterday")).toBeInTheDocument()
    expect(screen.getByText("Attention")).toBeInTheDocument()
  })

  it("makes the whole card the link to that athlete", () => {
    render(<MobileRosterList athletes={[athlete()]} />)

    expect(screen.getByRole("link")).toHaveAttribute("href", "/coach/athletes/athlete-1")
  })

  it("shows a dash rather than 0% when nothing was due", () => {
    render(
      <MobileRosterList
        athletes={[athlete({ compliancePct: null, sessionsCompleted: 0, sessionsDue: 0 })]}
      />
    )

    expect(screen.queryByText("0%")).not.toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders one card per athlete", () => {
    render(
      <MobileRosterList
        athletes={[athlete(), athlete({ athleteUserId: "athlete-2", displayName: "Priya Nair" })]}
      />
    )

    expect(screen.getAllByRole("link")).toHaveLength(2)
  })
})
