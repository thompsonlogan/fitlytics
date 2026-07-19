import { describe, expect, it } from "vitest"

import { computeDeviation, formatDeviation } from "@/lib/deviation"

describe("computeDeviation", () => {
  it.each([
    ["no prescription to compare against", null, 225],
    ["nothing logged yet", 225, null],
    ["a zero target would divide by zero", 0, 225],
  ])("returns null when %s", (_label, target, actual) => {
    expect(computeDeviation(target, actual)).toBeNull()
  })

  it("reports an overshoot as positive", () => {
    expect(computeDeviation(200, 220)).toMatchObject({ pct: 10, flagged: true })
  })

  it("reports an undershoot as negative", () => {
    expect(computeDeviation(200, 180)).toMatchObject({ pct: -10, flagged: true })
  })

  it("treats hitting the prescription exactly as no deviation", () => {
    expect(computeDeviation(225, 225)).toMatchObject({ pct: 0, flagged: false })
  })

  it("does not flag a deviation sitting exactly on the threshold", () => {
    expect(computeDeviation(100, 103)?.flagged).toBe(false)
    expect(computeDeviation(100, 97)?.flagged).toBe(false)
  })

  it("flags just past the threshold in both directions", () => {
    expect(computeDeviation(100, 103.5)?.flagged).toBe(true)
    expect(computeDeviation(100, 96.5)?.flagged).toBe(true)
  })

  it("flags a deviation that rounds down to the threshold", () => {
    const dev = computeDeviation(100, 103.4)
    expect(dev?.pct).toBe(3)
    expect(dev?.flagged).toBe(true)
  })
})

describe("formatDeviation", () => {
  it.each([
    [10, "+10%"],
    [-10, "-10%"],
    [0, "on target"],
  ])("%s -> %s", (pct, expected) => {
    expect(formatDeviation(pct)).toBe(expected)
  })
})
