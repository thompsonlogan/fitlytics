import { describe, expect, it } from "vitest"

import { formatRelativeDay, initials } from "@/lib/relative-time"

const now = new Date("2026-07-19T12:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms)

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("formatRelativeDay", () => {
  it.each([
    ["never trained", null, "Never"],
    ["minutes ago", ago(30 * MINUTE), "Just now"],
    ["earlier today", ago(6 * HOUR), "Today"],
    ["one day", ago(DAY), "Yesterday"],
    ["a few days", ago(3 * DAY), "3 days ago"],
    ["just over a week", ago(9 * DAY), "Last week"],
    ["several weeks", ago(30 * DAY), "4 weeks ago"],
  ])("%s", (_label, value, expected) => {
    expect(formatRelativeDay(value, now)).toBe(expected)
  })

  it("falls back to a date once the gap is wide", () => {
    expect(formatRelativeDay(ago(120 * DAY), now)).toMatch(/\w{3} \d+/)
  })

  it("does not render a future timestamp as elapsed", () => {
    expect(formatRelativeDay(new Date(now.getTime() + DAY), now)).toBe("Scheduled")
  })
})

describe("initials", () => {
  it.each([
    ["Marcus Webb", "MW"],
    ["dana kim", "DK"],
    ["Cher", "CH"],
    ["Mary Jane Watson", "MW"],
    ["  spaced   out  ", "SO"],
    ["", "?"],
  ])("%s -> %s", (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})
