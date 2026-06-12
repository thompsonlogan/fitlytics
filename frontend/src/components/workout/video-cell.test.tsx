import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// The global lucide-react mock is a name-agnostic Proxy, which can't satisfy
// Vitest's static named-export check for `import { Video }`. Use the real icons
// for this file — VideoCell renders a single lucide glyph, so it's cheap.
vi.mock("lucide-react", async () => await vi.importActual<typeof import("lucide-react")>("lucide-react"))

import { VideoCell } from "./video-cell"

describe("VideoCell", () => {
  it("renders an empty (outline) trigger when no sets are filmed", async () => {
    render(
      <VideoCell filmedCount={0} totalSets={2} firstFilmedSet={null} exerciseName="Squat" onOpen={() => {}} />
    )
    const btn = screen.getByRole("button")
    expect(btn).toHaveAttribute("title", "Add a video for a set")
    // No fraction shown when nothing is filmed.
    expect(btn.textContent).toBe("")
    // Empty cells don't carry the filled background.
    expect(btn.className).not.toContain("bg-foreground")
  })

  it("shows a filmed/total fraction while a multi-set block is partially filmed", () => {
    render(
      <VideoCell filmedCount={1} totalSets={2} firstFilmedSet={0} exerciseName="Squat" onOpen={() => {}} />
    )
    const btn = screen.getByRole("button")
    expect(btn.textContent).toContain("1/2")
    expect(btn.className).toContain("bg-foreground")
    expect(btn).toHaveAttribute("title", "Review · 1/2 sets filmed")
  })

  it("drops the fraction and shows the solid icon once fully filmed", () => {
    render(
      <VideoCell filmedCount={2} totalSets={2} firstFilmedSet={0} exerciseName="Squat" onOpen={() => {}} />
    )
    const btn = screen.getByRole("button")
    expect(btn.textContent).toBe("")
    expect(btn.className).toContain("bg-foreground")
    expect(btn).toHaveAttribute("title", "Review videos")
  })

  it("opens on the first filmed set when reviewing, else set 0", async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <VideoCell filmedCount={1} totalSets={3} firstFilmedSet={2} exerciseName="Squat" onOpen={onOpen} />
    )
    await user.click(screen.getByRole("button"))
    expect(onOpen).toHaveBeenLastCalledWith(2)

    rerender(
      <VideoCell filmedCount={0} totalSets={3} firstFilmedSet={null} exerciseName="Squat" onOpen={onOpen} />
    )
    await user.click(screen.getByRole("button"))
    expect(onOpen).toHaveBeenLastCalledWith(0)
  })
})
