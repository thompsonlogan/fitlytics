import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { routerMock } from "@/test/mocks/router-mock"

vi.mock("@tanstack/react-router", () => routerMock)

import { SubBar } from "@/components/workout/sub-bar"
import type { ProgramBlock, ProgramDay } from "@/lib/program-data"

const BLOCKS: ProgramBlock[] = [
  { id: "b1", sequence: 1, name: "Block 1", weekStart: 1, weekEnd: 4 },
  { id: "b2", sequence: 2, name: "Block 2", weekStart: 5, weekEnd: 9 },
]

const days: ProgramDay[] = Array.from({ length: 7 }, (_, i) => ({
  id: `d${i + 1}`,
  name: i === 0 ? "Day 1" : "Rest",
  tag: i === 0 ? "Day 1" : "OFF",
  off: i !== 0,
}))

function renderSubBar(props: Partial<React.ComponentProps<typeof SubBar>> = {}) {
  const onWeekChange = vi.fn()
  render(
    <SubBar
      breadcrumb={[{ label: "Programs" }, { label: "Logan PL" }]}
      weekCount={9}
      blocks={BLOCKS}
      days={days}
      week={6}
      dayIndex={0}
      todayWeek={null}
      todayDayIndex={null}
      dayData={days[0]}
      completedDays={{}}
      onWeekChange={onWeekChange}
      onDayChange={vi.fn()}
      {...props}
    />
  )
  return { onWeekChange }
}

describe("SubBar block scoping", () => {
  it("shows the active block and the block-relative week number", () => {
    renderSubBar({ week: 6 }) // 2nd week of Block 2

    expect(screen.getByText("Block 2")).toBeInTheDocument()
    // Global week 6 → "Week 2" within Block 2 (both header and pager label).
    expect(screen.getAllByText("Week 2").length).toBeGreaterThan(0)
    expect(screen.queryByText("Week 6")).not.toBeInTheDocument()
  })

  it("pages within the block and translates back to a global week", async () => {
    const user = userEvent.setup()
    const { onWeekChange } = renderSubBar({ week: 6 })

    await user.click(screen.getByRole("button", { name: "Next week" }))
    expect(onWeekChange).toHaveBeenCalledWith(7)
  })

  it("disables Previous on the block's first week", () => {
    renderSubBar({ week: 5 }) // Block 2, week-in-block 1
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next week" })).toBeEnabled()
  })

  it("disables Next on the block's last week (a 5-week block ending in a deload)", () => {
    renderSubBar({ week: 9 }) // Block 2, week-in-block 5
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Previous week" })).toBeEnabled()
  })

  it("jumps to a block's first global week when a block is picked", async () => {
    const user = userEvent.setup()
    const { onWeekChange } = renderSubBar({ week: 6 })

    await user.click(screen.getByText("Block 2")) // open the dropdown
    await user.click(await screen.findByText("Block 1")) // pick another block

    expect(onWeekChange).toHaveBeenCalledWith(1) // Block 1 weekStart
  })
})
