import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RpePairCell } from "@/components/coach/rpe-pair-cell"

describe("RpePairCell", () => {
  it("pairs the target with what the athlete reported", () => {
    render(<RpePairCell target={8} actual={9} />)

    expect(screen.getByText("8")).toBeInTheDocument()
    expect(screen.getByText("9")).toBeInTheDocument()
  })

  it("calls out a set that ran a full point hard", () => {
    render(<RpePairCell target={8} actual={9} />)

    expect(screen.getByTitle(/Logged 9 against a target of 8/)).toBeInTheDocument()
  })

  it("leaves a set at or below target unflagged", () => {
    render(<RpePairCell target={8} actual={8.5} />)

    expect(screen.queryByTitle(/against a target/)).not.toBeInTheDocument()
  })

  it("does not flag when there is no target to exceed", () => {
    render(<RpePairCell target={null} actual={10} />)

    expect(screen.queryByTitle(/against a target/)).not.toBeInTheDocument()
  })

  it("collapses to a dash when neither value exists", () => {
    const { container } = render(<RpePairCell target={null} actual={null} />)

    expect(container.textContent).toBe("—")
  })
})
