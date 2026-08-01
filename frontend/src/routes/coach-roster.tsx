import { useState } from "react"

import type { RosterFilter } from "@/components/coach/roster-filters"
import { RosterListing } from "@/components/coach/roster-listing"
import { RosterToolbar } from "@/components/coach/roster-toolbar"
import { useCoachRoster, type RosterAthlete } from "@/hooks/use-coach-roster"

function matches(a: RosterAthlete, query: string, filter: RosterFilter): boolean {
  const q = query.trim().toLowerCase()
  if (q) {
    const haystack = `${a.displayName} ${a.email ?? ""} ${a.programName ?? ""}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }

  switch (filter) {
    case "review":
      return a.videosWaiting > 0
    case "attention":
      return a.status === "attention"
    default:
      return true
  }
}

export function CoachRosterPage() {
  const { data, isLoading, error } = useCoachRoster()

  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<RosterFilter>("all")

  const athletes = data ?? []
  const visible = athletes.filter((a) => matches(a, query, filter))
  const videosWaiting = athletes.reduce((sum, a) => sum + a.videosWaiting, 0)

  return (
    <main className="mx-auto w-full max-w-6xl px-3.5 py-3.5 md:px-5 md:py-6">
      <RosterToolbar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        athleteCount={athletes.length}
        videosWaiting={videosWaiting}
      />

      <RosterListing
        athletes={visible}
        isLoading={isLoading}
        isError={!!error}
        rosterIsEmpty={athletes.length === 0}
      />
    </main>
  )
}
