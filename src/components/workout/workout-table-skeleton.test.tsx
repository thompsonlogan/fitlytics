import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { WorkoutTableSkeleton } from "./workout-table-skeleton"

describe("WorkoutTableSkeleton", () => {
  it("renders an a11y-friendly status region with aria-busy", () => {
    render(<WorkoutTableSkeleton />)

    // Screen-reader users should hear "Loading workout" / "Loading session"
    // and assistive tech should know the region is busy.
    const region = screen.getByRole("status", { name: /loading workout/i })
    expect(region).toBeInTheDocument()
    expect(region).toHaveAttribute("aria-busy", "true")
    expect(screen.getByText(/loading session/i)).toBeInTheDocument()
  })

  it("renders the same header columns as the real workout table", () => {
    // Pinning the column set keeps the skeleton and the real table in sync —
    // if a new column gets added to WorkoutTable without updating the
    // skeleton, the visible jump on data-arrival would regress and this test
    // would fail to remind us.
    render(<WorkoutTableSkeleton />)

    const expected = [
      "Discipline",
      "Rest",
      "Sets",
      "Reps",
      "Intensity / weight",
      "Cap",
      "Load used",
      "RPE",
    ]
    for (const label of expected) {
      expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument()
    }
  })

  it("renders multiple placeholder rows so the height matches a typical session", () => {
    const { container } = render(<WorkoutTableSkeleton />)
    // <tbody> rows — exclude the header. 8 rows matches the skeleton's
    // SKELETON_ROW_COUNT; assert > 1 rather than == 8 so tweaking that
    // constant doesn't force a test update.
    const bodyRows = container.querySelectorAll("tbody tr")
    expect(bodyRows.length).toBeGreaterThan(1)
  })

  it("never renders any real input controls (purely decorative shimmer)", () => {
    render(<WorkoutTableSkeleton />)
    // No checkboxes, no text inputs — a skeleton that accidentally rendered
    // an editable input would let the user start typing into nothing.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })
})
