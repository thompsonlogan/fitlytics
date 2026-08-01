import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { routerMock } from "@/test/mocks/router-mock"

vi.mock("@tanstack/react-router", () => routerMock)

import { RosterListing } from "@/components/coach/roster-listing"
import type { RosterAthlete } from "@/hooks/use-coach-roster"
import { MOBILE_MAX_WIDTH } from "@/lib/breakpoints"
import { setViewportWidth } from "@/test/mocks/match-media-mock"

function athlete(overrides: Partial<RosterAthlete> = {}): RosterAthlete {
  return {
    linkId: "link-1",
    athleteUserId: "athlete-1",
    displayName: "Marcus Webb",
    programName: "Hypertrophy Block v3",
    currentWeek: 3,
    totalWeeks: 4,
    compliancePct: 75,
    sessionsCompleted: 6,
    sessionsDue: 8,
    avgRpe: 8.5,
    lastSessionAt: null,
    videosWaiting: 2,
    status: "attention",
    ...overrides,
  }
}

function renderListing(props: Partial<Parameters<typeof RosterListing>[0]> = {}) {
  render(
    <RosterListing
      athletes={[athlete()]}
      isLoading={false}
      isError={false}
      rosterIsEmpty={false}
      {...props}
    />
  )
}

describe("RosterListing", () => {
  it("renders the table on a desktop viewport", () => {
    renderListing()

    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("Marcus Webb")).toBeInTheDocument()
  })

  it("renders tappable cards instead of a table on a phone", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderListing()

    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Marcus Webb/ })).toBeInTheDocument()
  })

  it("skeletons the phone list while the roster loads", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderListing({ athletes: [], isLoading: true })

    expect(screen.getByTestId("mobile-roster-list-skeleton")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("distinguishes an empty roster from an empty filter result", () => {
    renderListing({ athletes: [], rosterIsEmpty: true })
    expect(screen.getByText("No athletes yet")).toBeInTheDocument()
  })

  it("reports a load failure rather than an empty roster", () => {
    renderListing({ athletes: [], isError: true, rosterIsEmpty: true })

    expect(screen.getByText("Could not load your roster")).toBeInTheDocument()
    expect(screen.queryByText("No athletes yet")).not.toBeInTheDocument()
  })
})
