import { CalendarCheck2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BlockSelector } from "@/components/workout/block-selector"
import { DaySelector } from "@/components/workout/day-selector"
import { SubBarBreadcrumb, type Crumb } from "@/components/workout/sub-bar-breadcrumb"
import { WeekPager } from "@/components/workout/week-pager"
import { blockForWeek, type ProgramBlock, type ProgramDay } from "@/lib/program-data"

type SubBarProps = {
  breadcrumb: Crumb[]
  weekCount: number
  blocks: ProgramBlock[]
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
  onResetToToday?: () => void
}

export function SubBar({
  breadcrumb,
  weekCount,
  blocks,
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
  const showTodayButton =
    onResetToToday != null && todayWeek != null && todayDayIndex != null && !isToday

  const activeBlock = blockForWeek(blocks, week)
  const weekStart = activeBlock?.weekStart ?? 1
  const weekEnd = activeBlock?.weekEnd ?? weekCount
  const weekInBlock = week - weekStart + 1
  const weekCountInBlock = weekEnd - weekStart + 1

  const handleBlockChange = (sequence: number) => {
    const target = blocks.find((b) => b.sequence === sequence)
    if (target) onWeekChange(target.weekStart)
  }
  const handleWeekInBlockChange = (nextInBlock: number) => {
    onWeekChange(weekStart + nextInBlock - 1)
  }

  return (
    <div className="border-b bg-background px-3.5 pt-3.5 pb-4 md:flex md:flex-wrap md:items-center md:gap-3 md:px-5 md:py-3.5">
      <div className="min-w-0 flex-shrink overflow-hidden [&>nav]:mb-0 [&>nav]:text-[0.625rem] md:[&>nav]:mb-1 md:[&>nav]:text-[0.6875rem] [&>nav>a:last-child]:truncate [&>nav>span:last-child]:truncate">
        <SubBarBreadcrumb crumbs={breadcrumb} />
        <div className="mt-1.5 flex items-start gap-2.5 md:mt-0 md:items-center md:gap-2 md:whitespace-nowrap">
          <div className="min-w-0 flex-1 md:flex md:items-center md:gap-2">
            <span className="block text-xl font-semibold tracking-tight md:text-[1.0625rem]">
              {dayData.off ? "Rest day" : dayData.name}
            </span>
            <span className="mt-0.5 block text-[0.8125rem] font-medium text-muted-foreground md:mt-0 md:inline">
              <span className="hidden md:inline">· </span>
              Week {weekInBlock} · {dayData.tag}
            </span>
          </div>
          {isToday && (
            <Badge variant="outline" className="mt-1 flex-none md:mt-0 md:ml-1">
              Today
            </Badge>
          )}
        </div>
      </div>

      <div className="hidden md:block md:flex-1" />

      <BlockSelector
        blocks={blocks}
        activeBlockSequence={activeBlock?.sequence ?? 1}
        onBlockChange={handleBlockChange}
        className="mt-3.5 md:mt-0"
      />

      <WeekPager
        week={weekInBlock}
        weekCount={weekCountInBlock}
        onWeekChange={handleWeekInBlockChange}
        className="mt-2.5 h-8 w-full md:mt-0 md:h-7 md:w-auto"
        buttonClassName="w-9 md:w-7"
        labelClassName="flex-1 md:min-w-20 md:flex-none md:px-2"
      />

      <DaySelector
        days={days}
        week={week}
        dayIndex={dayIndex}
        todayWeek={todayWeek}
        todayDayIndex={todayDayIndex}
        startDate={startDate}
        completedDays={completedDays}
        onDayChange={onDayChange}
        className="mt-2.5 [scrollbar-width:none] overflow-x-auto md:mt-0 md:overflow-visible [&::-webkit-scrollbar]:hidden [&>button]:min-w-13 [&>button]:flex-1 md:[&>button]:flex-none"
      />

      {showTodayButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={onResetToToday}
          className="hidden md:inline-flex"
        >
          <CalendarCheck2 className="size-3.5" />
          Today
        </Button>
      )}
    </div>
  )
}
