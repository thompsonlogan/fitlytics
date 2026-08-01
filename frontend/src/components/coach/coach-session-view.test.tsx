import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { CoachSessionView } from "@/components/coach/coach-session-view"
import type { BlockActuals } from "@/hooks/use-coach-session"
import { MOBILE_MAX_WIDTH } from "@/lib/breakpoints"
import type { ProgramDay } from "@/lib/program-data"
import { setViewportWidth } from "@/test/mocks/match-media-mock"

const LOGGED: BlockActuals = {
  state: "completed",
  loadLb: 210,
  rpe: 8,
  repsActual: 5,
  videosTotal: 0,
  videosUnreviewed: 0,
}

const DAY: ProgramDay = {
  id: "day-1",
  name: "Lower A",
  tag: "D1",
  exercises: [
    {
      name: "Back Squat",
      rest: 3,
      blocks: [
        {
          id: "block-1",
          sets: 3,
          repsMin: 5,
          repsMax: 5,
          intensity: "80% 1RM",
          cap: "",
          rpe: 8,
          prescribedLoad: 200,
        },
      ],
    },
  ],
}

function renderView(day: ProgramDay = DAY, isLoading = false) {
  render(
    <CoachSessionView
      day={day}
      isLoading={isLoading}
      actualsFor={() => LOGGED}
      onOpenVideo={vi.fn()}
    />
  )
}

describe("CoachSessionView", () => {
  it("renders the prescribed-vs-actual table on a desktop viewport", () => {
    renderView()

    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("Back Squat")).toBeInTheDocument()
  })

  it("renders exercise cards instead of a table on a phone", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderView()

    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText("Back Squat")).toBeInTheDocument()
    expect(screen.getByText("210")).toBeInTheDocument()
  })

  it("skeletons the phone cards while the session loads", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderView(DAY, true)

    expect(screen.getByTestId("mobile-coach-workout-skeleton")).toBeInTheDocument()
  })

  it("shows the rest day card on both viewports", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderView({ id: "day-2", name: "Rest", tag: "D2", off: true })

    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText("Rest")).toBeInTheDocument()
  })
})
