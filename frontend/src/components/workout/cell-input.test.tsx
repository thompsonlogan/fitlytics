import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { LoadCellInput } from "./load-cell-input"
import { RpeCellInput } from "./rpe-cell-input"

const noop = () => {}

describe("LoadCellInput", () => {
  it("prefers an active edit, then falls back to the persisted value or placeholder", () => {
    const { rerender } = render(
      <LoadCellInput
        cellKey="0-1"
        edited="315"
        persisted={225}
        error={undefined}
        onEdit={noop}
        onBlur={noop}
      />
    )

    expect(screen.getByTestId("load-input-0-1")).toHaveValue("315")

    rerender(
      <LoadCellInput
        cellKey="0-1"
        edited={undefined}
        persisted={225}
        error={undefined}
        onEdit={noop}
        onBlur={noop}
      />
    )
    expect(screen.getByTestId("load-input-0-1")).toHaveValue("225")

    rerender(
      <LoadCellInput
        cellKey="0-1"
        edited={undefined}
        persisted=""
        error={undefined}
        onEdit={noop}
        onBlur={noop}
      />
    )
    expect(screen.getByTestId("load-input-0-1")).toHaveValue("")
    expect(screen.getByTestId("load-input-0-1")).toHaveAttribute("placeholder", "—")
  })

  it("exposes its error state accessibly and applies destructive styling", () => {
    render(
      <LoadCellInput
        cellKey="0-1"
        edited={undefined}
        persisted=""
        error="out of range"
        onEdit={noop}
        onBlur={noop}
      />
    )

    const input = screen.getByTestId("load-input-0-1")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("title", "out of range")
    expect(input).toHaveClass("border-destructive", "bg-destructive/10", "text-destructive")
  })

  it("reports edits and blurs with the cell key", () => {
    const onEdit = vi.fn()
    const onBlur = vi.fn()
    render(
      <LoadCellInput
        cellKey="0-1"
        edited={undefined}
        persisted=""
        error={undefined}
        onEdit={onEdit}
        onBlur={onBlur}
      />
    )

    const input = screen.getByTestId("load-input-0-1")
    fireEvent.change(input, { target: { value: "315" } })
    fireEvent.blur(input, { target: { value: "315" } })

    expect(onEdit).toHaveBeenCalledWith("0-1", "315")
    expect(onBlur).toHaveBeenCalledWith("0-1", "315")
  })
})

describe("RpeCellInput", () => {
  it("uses the same value precedence and preserves the testid and aria-label contracts", () => {
    const { rerender } = render(
      <RpeCellInput
        cellKey="0-1"
        edited="9"
        persisted={7}
        error={undefined}
        ariaLabel="RPE for Squat block 2"
        onEdit={noop}
        onBlur={noop}
        emptyClassName="empty-state"
      />
    )

    const input = screen.getByTestId("rpe-input-0-1")
    expect(input).toHaveValue("9")
    expect(input).toHaveAttribute("aria-label", "RPE for Squat block 2")

    rerender(
      <RpeCellInput
        cellKey="0-1"
        edited={undefined}
        persisted={7}
        error={undefined}
        ariaLabel="RPE for Squat block 2"
        onEdit={noop}
        onBlur={noop}
        emptyClassName="empty-state"
      />
    )
    expect(screen.getByTestId("rpe-input-0-1")).toHaveValue("7")

    rerender(
      <RpeCellInput
        cellKey="0-1"
        edited={undefined}
        persisted={null}
        error={undefined}
        ariaLabel="RPE for Squat block 2"
        onEdit={noop}
        onBlur={noop}
        emptyClassName="empty-state"
      />
    )
    expect(screen.getByTestId("rpe-input-0-1")).toHaveValue("")
    expect(screen.getByTestId("rpe-input-0-1")).toHaveClass("empty-state")
  })

  it("reports errors, edits, and blurs through the shared contract", () => {
    const onEdit = vi.fn()
    const onBlur = vi.fn()
    render(
      <RpeCellInput
        cellKey="0-1"
        edited={undefined}
        persisted={null}
        error="out of range"
        ariaLabel="RPE for Squat set 2"
        onEdit={onEdit}
        onBlur={onBlur}
      />
    )

    const input = screen.getByTestId("rpe-input-0-1")
    fireEvent.change(input, { target: { value: "8" } })
    fireEvent.blur(input, { target: { value: "8" } })

    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("title", "out of range")
    expect(input).toHaveClass("border-destructive", "bg-destructive/10", "text-destructive")
    expect(onEdit).toHaveBeenCalledWith("0-1", "8")
    expect(onBlur).toHaveBeenCalledWith("0-1", "8")
  })
})
