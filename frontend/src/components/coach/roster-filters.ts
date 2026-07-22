export const ROSTER_FILTERS = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs review" },
  { id: "attention", label: "Attention" },
] as const

export type RosterFilter = (typeof ROSTER_FILTERS)[number]["id"]
