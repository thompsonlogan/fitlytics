import { Users } from "lucide-react"

import { MobileRosterList, MobileRosterListSkeleton } from "@/components/coach/mobile-roster-list"
import { RosterTable } from "@/components/coach/roster-table"
import { RosterTableSkeleton } from "@/components/coach/roster-table-skeleton"
import type { RosterAthlete } from "@/hooks/use-coach-roster"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"

type RosterListingProps = {
  athletes: RosterAthlete[]
  isLoading: boolean
  isError: boolean
  rosterIsEmpty: boolean
}

export function RosterListing({ athletes, isLoading, isError, rosterIsEmpty }: RosterListingProps) {
  const isMobile = useIsMobile()

  const body = isLoading ? (
    isMobile ? (
      <MobileRosterListSkeleton />
    ) : (
      <RosterTableSkeleton />
    )
  ) : isError ? (
    <EmptyState
      title="Could not load your roster"
      body="Something went wrong fetching your athletes. Refresh to try again."
    />
  ) : rosterIsEmpty ? (
    <EmptyState
      title="No athletes yet"
      body="Coaching links are set up out of band for now — once an athlete is linked to you, they appear here."
    />
  ) : athletes.length === 0 ? (
    <EmptyState title="No matches" body="No athletes match this filter." />
  ) : isMobile ? (
    <MobileRosterList athletes={athletes} />
  ) : (
    <RosterTable athletes={athletes} />
  )

  const bare = isMobile && (isLoading || (!isError && !rosterIsEmpty && athletes.length > 0))

  return <div className={cn("mt-4", !bare && "rounded-xl border")}>{body}</div>
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
