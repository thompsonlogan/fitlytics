import { ChevronLeft, ChevronRight, Play } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DaySelector } from "@/components/workout/day-selector"
import { type ProgramDay } from "@/lib/program-data"

type MobileSubBarProps = {
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
}

// MobileSubBar is the phone reflow of the desktop SubBar: the same breadcrumb,
// title, week pager, day strip and "Start session" action, stacked into a
// single column. The desktop "back to Today" button is dropped — tapping a day
// chip is the touch equivalent and the "Today" badge already marks the spot.
export function MobileSubBar({
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
}: MobileSubBarProps) {
  const isToday = todayWeek === week && todayDayIndex === dayIndex

  return (
    <div className="border-b bg-background px-3.5 pt-3.5 pb-4">
      <div className="flex items-center gap-1.5 text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
        <span>Programs</span>
        <ChevronRight className="size-2.5" />
        <span className="truncate">{programName}</span>
      </div>

      <div className="mt-1.5 flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <span className="block text-xl font-semibold tracking-tight">
            {dayData.off ? "Rest day" : dayData.name}
          </span>
          <span className="mt-0.5 block text-[0.8125rem] font-medium text-muted-foreground">
            Week {week} · {dayData.tag}
          </span>
        </div>
        {isToday && (
          <Badge variant="outline" className="mt-1 flex-none">
            Today
          </Badge>
        )}
      </div>

      <div className="mt-3.5 flex items-center gap-2">
        <div
          className="inline-flex h-8 flex-1 items-stretch overflow-hidden rounded-md border bg-background"
          aria-label="Week selector"
        >
          <button
            type="button"
            className="inline-flex w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            onClick={() => onWeekChange(Math.max(1, week - 1))}
            disabled={week === 1}
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="inline-flex flex-1 items-center justify-center border-x text-[0.8125rem] font-medium">
            Week {week}
          </span>
          <button
            type="button"
            className="inline-flex w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            onClick={() => onWeekChange(Math.min(weekCount, week + 1))}
            disabled={week === weekCount}
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
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
        className="mt-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:min-w-13 [&>button]:flex-1"
      />

      <Button size="lg" className="mt-3.5 h-10 w-full justify-center text-sm">
        <Play className="size-3.5" />
        Start session
      </Button>
    </div>
  )
}
