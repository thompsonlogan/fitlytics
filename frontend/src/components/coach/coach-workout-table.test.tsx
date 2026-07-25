import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { CoachWorkoutTable } from "@/components/coach/coach-workout-table"
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

function renderTable(actuals: Partial<BlockActuals> = {}, onOpenVideo = vi.fn()) {
  render(
    <CoachWorkoutTable
      day={day()}
      actualsFor={() => ({ ...NOTHING_LOGGED, ...actuals })}
      onOpenVideo={onOpenVideo}
    />
  )
  return { onOpenVideo }
}

describe("CoachWorkoutTable", () => {
  it("shows the prescription alongside what was logged", () => {
    renderTable({ state: "completed", loadLb: 210, rpe: 8 })

    expect(screen.getByText("Back Squat")).toBeInTheDocument()
    expect(screen.getByText("200")).toBeInTheDocument()
    expect(screen.getByText("210")).toBeInTheDocument()
    expect(screen.getByText("+5%")).toBeInTheDocument()
  })

  it("leaves the actual blank when the athlete logged nothing", () => {
    renderTable()

    const row = within(screen.getByRole("table")).getAllByRole("row")[1]!
    expect(within(row).queryByText(/%$/)).not.toBeInTheDocument()
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0)
  })

  it("styles a load within tolerance differently from one that misses", () => {
    const { unmount } = render(
      <CoachWorkoutTable
        day={day()}
        actualsFor={() => ({ ...NOTHING_LOGGED, state: "completed", loadLb: 202 })}
        onOpenVideo={vi.fn()}
      />
    )
    const withinTolerance = screen.getByText("+1%").className
    unmount()

    renderTable({ state: "completed", loadLb: 180 })
    const missed = screen.getByText("-10%").className

    expect(withinTolerance).toContain("text-muted-foreground")
    expect(missed).toContain("amber")
  })

  it("marks a skipped block distinctly from an unlogged one", () => {
    renderTable({ state: "skipped" })

    expect(screen.getByLabelText("Skipped")).toBeInTheDocument()
    expect(screen.queryByLabelText("Not logged")).not.toBeInTheDocument()
  })

  // A block the athlete part-finished must not read as untouched — that would
  // misrepresent the compliance the coach is here to judge.
  it("distinguishes a part-finished block from one never started", () => {
    renderTable({ state: "partial" })

    expect(screen.getByLabelText("Partly completed")).toBeInTheDocument()
    expect(screen.queryByLabelText("Not logged")).not.toBeInTheDocument()
  })

  it("surfaces videos still awaiting review", async () => {
    const user = userEvent.setup()
    const { onOpenVideo } = renderTable({ videosTotal: 3, videosUnreviewed: 2 })

    const button = screen.getByRole("button", { name: /2 of 3 awaiting review/i })
    await user.click(button)

    expect(onOpenVideo).toHaveBeenCalledWith("0-0")
  })

  it("offers nothing to click when no set was filmed", () => {
    renderTable()

    expect(screen.queryByRole("button", { name: /review/i })).not.toBeInTheDocument()
  })

  // An unrecognised state must degrade, not take the table down with it.
  it("survives a set state the UI does not know about", () => {
    render(
      <CoachWorkoutTable
        day={day()}
        actualsFor={() =>
          ({ ...NOTHING_LOGGED, state: "deloaded" }) as unknown as BlockActuals
        }
        onOpenVideo={vi.fn()}
      />
    )

    expect(screen.getByText("Back Squat")).toBeInTheDocument()
    expect(screen.getByLabelText("Unknown")).toBeInTheDocument()
  })

  it("renders a rest day as no rows", () => {
    render(
      <CoachWorkoutTable
        day={{ id: "d", name: "Rest", tag: "D2", off: true }}
        actualsFor={() => NOTHING_LOGGED}
        onOpenVideo={vi.fn()}
      />
    )

    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1)
  })
})
