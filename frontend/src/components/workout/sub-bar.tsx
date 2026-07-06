import { CalendarCheck2, ChevronLeft, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DaySelector } from "@/components/workout/day-selector"
import { type ProgramDay } from "@/lib/program-data"

type SubBarProps = {
  programName: string
  weekCount: number
  days: ProgramDay[]
  week: number
  dayIndex: number
  todayWeek: number | null
  todayDayIndex: number | null
  dayData: ProgramDay
  startDate?: string
  completedDays: Record<string, boolean>
  onWeekChange: (next: number) => void
  onDayChange: (next: number) => void
  onResetToToday: () => void
}

export function SubBar({
  programName,
  weekCount,
  days,
  week,
  dayIndex,
  todayWeek,
  todayDayIndex,
  dayData,
  startDate,
  completedDays,
  onWeekChange,
  onDayChange,
  onResetToToday,
}: SubBarProps) {
  const isToday = todayWeek === week && todayDayIndex === dayIndex
  const showTodayButton = todayWeek != null && todayDayIndex != null && !isToday
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-background px-5 py-3.5">
      <div className="min-w-0 flex-shrink">
        <div className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
          <span>Programs</span>
          <ChevronRight className="size-2.5" />
          <span>{programName}</span>
        </div>
        <div className="flex items-center gap-2 text-[1.0625rem] font-semibold tracking-tight whitespace-nowrap">
          <span>{dayData.off ? "Rest day" : dayData.name}</span>
          <span className="font-medium text-muted-foreground">
            · Week {week} · {dayData.tag}
          </span>
          {isToday && (
            <Badge variant="outline" className="ml-1">
              Today
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1" />

      <div
        className="inline-flex h-7 items-stretch overflow-hidden rounded-md border bg-background"
        aria-label="Week selector"
      >
        <button
          type="button"
          className="inline-flex w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          onClick={() => onWeekChange(Math.max(1, week - 1))}
          disabled={week === 1}
          title="Previous week"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="inline-flex min-w-20 items-center justify-center border-x px-2 text-[0.8125rem] font-medium">
          Week {week}
        </span>
        <button
          type="button"
          className="inline-flex w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          onClick={() => onWeekChange(Math.min(weekCount, week + 1))}
          disabled={week === weekCount}
          title="Next week"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      <DaySelector
        days={days}
        week={week}
        dayIndex={dayIndex}
        todayWeek={todayWeek}
        todayDayIndex={todayDayIndex}
        startDate={startDate}
        completedDays={completedDays}
        onDayChange={onDayChange}
      />

      {showTodayButton && (
        <Button variant="outline" size="sm" onClick={onResetToToday}>
          <CalendarCheck2 className="size-3.5" />
          Today
        </Button>
      )}
    </div>
  )
}
