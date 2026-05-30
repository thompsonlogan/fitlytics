import { CalendarCheck2, ChevronLeft, ChevronRight, Play } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DAY_LETTERS, type ProgramDay } from "@/lib/program-data"
import { cn } from "@/lib/utils"

type SubBarProps = {
  programName: string
  weekCount: number
  days: ProgramDay[]
  week: number
  dayIndex: number
  todayIndex: number
  dayData: ProgramDay
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
  todayIndex,
  dayData,
  completedDays,
  onWeekChange,
  onDayChange,
  onResetToToday,
}: SubBarProps) {
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
          {dayIndex === todayIndex && (
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

      <div
        className="flex gap-0.5 rounded-md bg-muted p-0.5"
        role="tablist"
        aria-label="Day selector"
      >
        {days.map((d, i) => {
          const isActive = dayIndex === i
          const isComplete = !!completedDays[`${week}-${i}`]
          const isToday = i === todayIndex
          return (
            <button
              key={i}
              role="tab"
              aria-selected={isActive}
              onClick={() => onDayChange(i)}
              className={cn(
                "inline-flex min-w-13 flex-col items-center justify-center rounded-sm px-2.5 py-1 leading-none transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "text-[0.625rem] font-medium tracking-wider uppercase",
                  isToday && "text-foreground"
                )}
              >
                {DAY_LETTERS[i]}
              </span>
              <span
                className={cn(
                  "mt-1 text-[0.8125rem] font-semibold tabular-nums",
                  d.off && !isActive && "text-muted-foreground"
                )}
              >
                {d.off ? "·" : i + 1}
              </span>
              <span
                className={cn(
                  "mt-1 size-1 rounded-full bg-foreground transition-opacity",
                  isComplete ? "opacity-100" : "opacity-0"
                )}
              />
            </button>
          )
        })}
      </div>

      <Button variant="outline" size="sm" onClick={onResetToToday}>
        <CalendarCheck2 className="size-3.5" />
        Today
      </Button>
      <Button size="sm">
        <Play className="size-3.5" />
        Start session
      </Button>
    </div>
  )
}
