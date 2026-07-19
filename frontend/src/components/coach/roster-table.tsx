import { ChevronRight, Video } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AthleteIdentityCell } from "@/components/coach/athlete-identity-cell"
import { AthleteStatusBadge } from "@/components/coach/athlete-status-badge"
import { ComplianceCell } from "@/components/coach/compliance-cell"
import { ProgramProgressCell } from "@/components/coach/program-progress-cell"
import type { RosterAthlete } from "@/hooks/use-coach-roster"
import { formatRelativeDay } from "@/lib/relative-time"
import { cn } from "@/lib/utils"

type RosterTableProps = {
  athletes: RosterAthlete[]
}

export function RosterTable({ athletes }: RosterTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Athlete</TableHead>
          <TableHead>Program</TableHead>
          <TableHead>Compliance</TableHead>
          <TableHead>Avg RPE</TableHead>
          <TableHead>Last session</TableHead>
          <TableHead>Videos</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>

      <TableBody>
        {athletes.map((a) => (
          <TableRow key={a.athleteUserId}>
            <TableCell>
              <AthleteIdentityCell displayName={a.displayName} email={a.email} />
            </TableCell>

            <TableCell>
              <ProgramProgressCell
                programName={a.programName}
                currentWeek={a.currentWeek}
                totalWeeks={a.totalWeeks}
              />
            </TableCell>

            <TableCell>
              <ComplianceCell
                compliancePct={a.compliancePct}
                sessionsCompleted={a.sessionsCompleted}
                sessionsDue={a.sessionsDue}
              />
            </TableCell>

            <TableCell className="text-[0.8125rem] tabular-nums">
              {a.avgRpe == null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                a.avgRpe.toFixed(1)
              )}
            </TableCell>

            <TableCell className="text-[0.8125rem] text-muted-foreground">
              {formatRelativeDay(a.lastSessionAt)}
            </TableCell>

            <TableCell>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-[0.8125rem] tabular-nums",
                  a.videosWaiting > 0 ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                <Video className="size-3.5" strokeWidth={1.75} />
                {a.videosWaiting}
              </span>
            </TableCell>

            <TableCell>
              <AthleteStatusBadge status={a.status} />
            </TableCell>

            <TableCell>
              <ChevronRight className="size-4 text-muted-foreground/40" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
