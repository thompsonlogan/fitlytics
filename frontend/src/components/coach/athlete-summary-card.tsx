import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AthleteStatusBadge } from "@/components/coach/athlete-status-badge"
import type { RosterAthlete } from "@/hooks/use-coach-roster"
import { formatRelativeDay } from "@/lib/relative-time"

export function AthleteSummaryCard({ athlete }: { athlete: RosterAthlete }) {
  const stats: { label: string; value: string }[] = [
    {
      label: "Compliance",
      value:
        athlete.compliancePct == null
          ? "—"
          : `${athlete.compliancePct}% (${athlete.sessionsCompleted}/${athlete.sessionsDue})`,
    },
    { label: "Avg RPE", value: athlete.avgRpe?.toFixed(1) ?? "—" },
    { label: "Last session", value: formatRelativeDay(athlete.lastSessionAt) },
    { label: "Videos waiting", value: String(athlete.videosWaiting) },
  ]

  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">{athlete.displayName}</CardTitle>
        <AthleteStatusBadge status={athlete.status} />
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-3 gap-y-3 px-3.5 py-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
              {stat.label}
            </div>
            <div className="mt-0.5 text-[0.8125rem] font-medium tabular-nums">{stat.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
