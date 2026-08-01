import { Search } from "lucide-react"

import { ROSTER_FILTERS, type RosterFilter } from "@/components/coach/roster-filters"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type RosterToolbarProps = {
  query: string
  onQueryChange: (value: string) => void
  filter: RosterFilter
  onFilterChange: (value: RosterFilter) => void
  athleteCount: number
  videosWaiting: number
}

export function RosterToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  athleteCount,
  videosWaiting,
}: RosterToolbarProps) {
  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-end md:gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-lg">Athletes</h1>
        <p className="mt-0.5 text-[0.75rem] text-muted-foreground md:text-[0.8125rem]">
          {athleteCount} active {athleteCount === 1 ? "program" : "programs"}
          {videosWaiting > 0 &&
            ` · ${videosWaiting} ${videosWaiting === 1 ? "video" : "videos"} waiting for review`}
        </p>
      </div>

      <div className="hidden md:block md:flex-1" />

      <label className="relative">
        <span className="sr-only">Filter athletes</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filter athletes…"
          className="h-9 w-full pl-8 text-[0.8125rem] md:h-8 md:w-52"
        />
      </label>

      <div
        role="tablist"
        aria-label="Roster filter"
        className="flex items-center rounded-lg border p-0.5"
      >
        {ROSTER_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => onFilterChange(id)}
            className={cn(
              "flex-1 rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium transition-colors md:flex-none md:py-1",
              filter === id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
