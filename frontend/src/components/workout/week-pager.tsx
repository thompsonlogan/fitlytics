import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

type WeekPagerProps = {
  week: number
  weekCount: number
  onWeekChange: (next: number) => void
  className?: string
  buttonClassName?: string
  labelClassName?: string
}

export function WeekPager({
  week,
  weekCount,
  onWeekChange,
  className,
  buttonClassName,
  labelClassName,
}: WeekPagerProps) {
  return (
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border bg-background",
        className
      )}
      aria-label="Week selector"
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
          buttonClassName
        )}
        onClick={() => onWeekChange(Math.max(1, week - 1))}
        disabled={week === 1}
        aria-label="Previous week"
        title="Previous week"
      >
        <ChevronLeft className="size-4 md:size-3.5" />
      </button>
      <span
        className={cn(
          "inline-flex items-center justify-center border-x text-[0.8125rem] font-medium",
          labelClassName
        )}
      >
        Week {week}
      </span>
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
          buttonClassName
        )}
        onClick={() => onWeekChange(Math.min(weekCount, week + 1))}
        disabled={week === weekCount}
        aria-label="Next week"
        title="Next week"
      >
        <ChevronRight className="size-4 md:size-3.5" />
      </button>
    </div>
  )
}
