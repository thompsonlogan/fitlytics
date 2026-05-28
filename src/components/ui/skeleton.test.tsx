import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Skeleton } from "./skeleton"

describe("Skeleton", () => {
  it("renders a div with the shadcn data-slot marker and shimmer classes", () => {
    render(<Skeleton data-testid="s" />)
    const el = screen.getByTestId("s")
    expect(el).toBeInTheDocument()
    // data-slot is the shadcn convention for tagging primitives — consumers
    // can target `[data-slot=skeleton]` in tests/styles without coupling to
    // the implementation.
    expect(el).toHaveAttribute("data-slot", "skeleton")
    expect(el.className).toContain("animate-pulse")
    expect(el.className).toContain("bg-muted")
  })

  it("merges custom className with the defaults (cn helper behaviour)", () => {
    render(<Skeleton className="h-4 w-32" data-testid="s" />)
    const el = screen.getByTestId("s")
    // Both the consumer's sizing and the built-in shimmer should be present.
    expect(el.className).toContain("h-4")
    expect(el.className).toContain("w-32")
    expect(el.className).toContain("animate-pulse")
  })

  it("forwards arbitrary HTML props to the underlying div", () => {
    // The canonical shadcn component spreads ...props, so things like
    // aria-label, data-* attributes, and onClick all need to land on the div.
    render(<Skeleton aria-label="loading row" data-testid="s" />)
    expect(screen.getByTestId("s")).toHaveAttribute("aria-label", "loading row")
  })
})
