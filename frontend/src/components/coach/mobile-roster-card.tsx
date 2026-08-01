import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"

import { AthleteIdentityCell } from "@/components/coach/athlete-identity-cell"
import { AthleteStatusBadge } from "@/components/coach/athlete-status-badge"
import { ComplianceCell } from "@/components/coach/compliance-cell"
import { ProgramProgressCell } from "@/components/coach/program-progress-cell"
import { VideosWaitingCell } from "@/components/coach/videos-waiting-cell"
import type { RosterAthlete } from "@/hooks/use-coach-roster"
import { formatRelativeDay } from "@/lib/relative-time"

export function MobileRosterCard({ athlete }: { athlete: RosterAthlete }) {
  return (
    <Link
      to="/coach/athletes/$athleteId"
      params={{ athleteId: athlete.athleteUserId }}
      className="flex flex-col gap-2.5 rounded-xl border bg-card p-3 active:bg-muted/50"
    >
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <AthleteIdentityCell displayName={athlete.displayName} email={athlete.email} />
        </div>
        <AthleteStatusBadge status={athlete.status} />
      </div>

      <div className="border-t pt-2.5">
        <ProgramProgressCell
          programName={athlete.programName}
          currentWeek={athlete.currentWeek}
          totalWeeks={athlete.totalWeeks}
        />
      </div>

      <div className="flex items-center gap-3">
        <ComplianceCell
          compliancePct={athlete.compliancePct}
          sessionsCompleted={athlete.sessionsCompleted}
          sessionsDue={athlete.sessionsDue}
        />
        <VideosWaitingCell count={athlete.videosWaiting} />
        <span className="truncate text-[0.75rem] text-muted-foreground">
          {formatRelativeDay(athlete.lastSessionAt)}
        </span>
        <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground/40" />
      </div>
    </Link>
  )
}
