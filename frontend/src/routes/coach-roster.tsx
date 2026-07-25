import { useState } from "react"

import { Users } from "lucide-react"

import { RosterTable } from "@/components/coach/roster-table"
import { RosterTableSkeleton } from "@/components/coach/roster-table-skeleton"
import type { RosterFilter } from "@/components/coach/roster-filters"
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
    <main className="mx-auto w-full max-w-6xl px-5 py-6">
      <RosterToolbar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        athleteCount={athletes.length}
        videosWaiting={videosWaiting}
      />

      <div className="mt-4 rounded-xl border">
        {isLoading ? (
          <RosterTableSkeleton />
        ) : error ? (
          <EmptyState
            title="Could not load your roster"
            body="Something went wrong fetching your athletes. Refresh to try again."
          />
        ) : athletes.length === 0 ? (
          <EmptyState
            title="No athletes yet"
            body="Coaching links are set up out of band for now — once an athlete is linked to you, they appear here."
          />
        ) : visible.length === 0 ? (
          <EmptyState title="No matches" body="No athletes match this filter." />
        ) : (
          <RosterTable athletes={visible} />
        )}
      </div>
    </main>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Users className="size-4" strokeWidth={1.75} />
      </span>
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      <p className="max-w-sm text-[0.8125rem] text-muted-foreground">{body}</p>
    </div>
  )
}
