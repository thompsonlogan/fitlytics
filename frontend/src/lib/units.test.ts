import { describe, expect, it } from "vitest"

import { kgToLbExact, kgToLbRounded, lbToKg } from "./units"

describe("unit conversion", () => {
  it("rounds kg to display pounds", () => {
    expect(kgToLbRounded(102.06)).toBe(225)
  })

  it("converts pounds back to kg without rounding", () => {
    expect(lbToKg(225)).toBeCloseTo(102.05840462301894, 10)
    expect(Number(lbToKg(225).toFixed(2))).toBe(102.06)
  })

  it("converts kg to exact pounds for volume math", () => {
    expect(kgToLbExact(100)).toBe(220.462)
  })

  it("round-trips displayed pounds through the API precision boundary", () => {
    expect(kgToLbRounded(Number(lbToKg(315).toFixed(2)))).toBe(315)
  })
})
