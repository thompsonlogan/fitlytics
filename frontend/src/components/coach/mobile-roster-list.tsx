import { MobileRosterCard } from "@/components/coach/mobile-roster-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { RosterAthlete } from "@/hooks/use-coach-roster"

export function MobileRosterList({ athletes }: { athletes: RosterAthlete[] }) {
  return (
    <div className="flex flex-col gap-2">
      {athletes.map((a) => (
        <MobileRosterCard key={a.athleteUserId} athlete={a} />
      ))}
    </div>
  )
}

export function MobileRosterListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" data-testid="mobile-roster-list-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-xl border p-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-7 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2 w-32" />
            </div>
            <Skeleton className="ml-auto h-5 w-20 rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 border-t pt-2.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2 w-24" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
