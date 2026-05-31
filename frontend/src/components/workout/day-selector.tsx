import { calendarDayOfMonth, DAY_LETTERS, type ProgramDay } from "@/lib/program-data"
import { cn } from "@/lib/utils"

type DaySelectorProps = {
  days: ProgramDay[]
  week: number
  dayIndex: number
  todayWeek: number | null
  todayDayIndex: number | null
  startDate?: string
  completedDays: Record<string, boolean>
  onDayChange: (next: number) => void
}

export function DaySelector({
  days,
  week,
  dayIndex,
  todayWeek,
  todayDayIndex,
  startDate,
  completedDays,
  onDayChange,
}: DaySelectorProps) {
  return (
    <div
      className="flex gap-0.5 rounded-md bg-muted p-0.5"
      role="tablist"
      aria-label="Day selector"
    >
      {days.map((d, i) => {
        const isActive = dayIndex === i
        const isComplete = !!completedDays[`${week}-${i}`]
        const isDayToday = todayWeek === week && todayDayIndex === i
        const calDay = startDate ? calendarDayOfMonth(startDate, week, i) : i + 1
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
                isDayToday && "text-foreground"
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
              {calDay}
            </span>
            {d.off ? (
              <span
                className={cn(
                  "mt-1 h-1 w-3 rounded-full",
                  isActive ? "bg-foreground" : "bg-muted-foreground"
                )}
                aria-label="Rest day"
              />
            ) : (
              <span
                className={cn(
                  "mt-1 size-1 rounded-full bg-foreground transition-opacity",
                  isComplete ? "opacity-100" : "opacity-0"
                )}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
