import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { MobileCoachWorkoutTable } from "@/components/coach/mobile-coach-workout-table"
import type { BlockActuals } from "@/hooks/use-coach-session"
import type { ProgramDay } from "@/lib/program-data"

const NOTHING_LOGGED: BlockActuals = {
  state: "pending",
  loadLb: null,
  rpe: null,
  repsActual: null,
  videosTotal: 0,
  videosUnreviewed: 0,
}

function day(overrides: Partial<ProgramDay> = {}): ProgramDay {
  return {
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
    ...overrides,
  }
}

function renderCards(actuals: Partial<BlockActuals> = {}) {
  const onOpenVideo = vi.fn()
  render(
    <MobileCoachWorkoutTable
      day={day()}
      actualsFor={() => ({ ...NOTHING_LOGGED, ...actuals })}
      onOpenVideo={onOpenVideo}
    />
  )
  return { onOpenVideo }
}

describe("MobileCoachWorkoutTable", () => {
  it("pairs the prescription with what the athlete logged", () => {
    renderCards({ state: "completed", loadLb: 210, rpe: 9 })

    expect(screen.getByText("Back Squat")).toBeInTheDocument()
    expect(screen.getByText("200")).toBeInTheDocument()
    expect(screen.getByText("210")).toBeInTheDocument()
    expect(screen.getByText("+5%")).toBeInTheDocument()
    expect(screen.getByText("9")).toBeInTheDocument()
  })

  it("says so plainly when the block has no logged load", () => {
    renderCards()

    expect(screen.getByText("Not logged")).toBeInTheDocument()
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })

  it("summarises the session in the header", () => {
    renderCards()

    expect(screen.getByText("1 exercises · 3 working sets")).toBeInTheDocument()
  })

  it("opens the review dialog for the block a coach taps", async () => {
    const user = userEvent.setup()
    const { onOpenVideo } = renderCards({ videosTotal: 2, videosUnreviewed: 1 })

    await user.click(screen.getByRole("button", { name: /Back Squat/ }))

    expect(onOpenVideo).toHaveBeenCalledWith("0-0")
  })

  it("offers no video trigger on a block with nothing filmed", () => {
    renderCards({ state: "completed", loadLb: 200 })

    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
