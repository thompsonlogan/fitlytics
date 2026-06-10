import { TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"

const VOLUME_BARS = [
  { height: 55 },
  { height: 70 },
  { height: 48 },
  { height: 82 },
  { height: 64 },
  { height: 38, lo: true },
  { height: 74 },
  { height: 90 },
  { height: 60 },
  { height: 30, lo: true },
]

const STAT = "rounded-md border border-border bg-card px-3 py-2.5"
const STAT_LABEL = "text-[0.625rem] font-medium tracking-[0.05em] text-muted-foreground uppercase"
const STAT_VALUE = "mt-0.5 text-xl font-semibold tracking-[-0.01em] tabular-nums"
const STAT_DELTA = "mt-px inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground [&_svg]:size-3"
const CHART = "rounded-md border border-border bg-card p-3.5"
const SEG = "rounded-[5px] px-1.5 py-0.5 font-mono text-[0.625rem]"

// Static analytics preview (e1RM trend + weekly volume) for the analytics
// feature row. Decorative only.
export function AnalyticsMock() {
  return (
    <div className="grid gap-3 bg-background p-4">
      <div className="grid grid-cols-3 gap-2.5">
        <div className={STAT}>
          <div className={STAT_LABEL}>Squat e1RM</div>
          <div className={STAT_VALUE}>
            347
            <span className="text-xs font-normal text-muted-foreground"> lb</span>
          </div>
          <div className={STAT_DELTA}>
            <TrendingUp /> +12 lb / 8wk
          </div>
        </div>
        <div className={STAT}>
          <div className={STAT_LABEL}>Weekly tonnage</div>
          <div className={STAT_VALUE}>48.2k</div>
          <div className={STAT_DELTA}>
            <TrendingUp /> +8.4%
          </div>
        </div>
        <div className={STAT}>
          <div className={STAT_LABEL}>Sessions</div>
          <div className={STAT_VALUE}>96</div>
          <div className={STAT_DELTA}>12 wk streak</div>
        </div>
      </div>
      <div className={CHART}>
        <div className="mb-2 flex items-center">
          <b className="text-[0.8125rem] font-semibold">Squat e1RM</b>
          <span className="flex-1" />
          <span className="flex gap-0.5">
            <span className={cn(SEG, "text-muted-foreground")}>1M</span>
            <span className={cn(SEG, "bg-secondary text-foreground")}>3M</span>
            <span className={cn(SEG, "text-muted-foreground")}>1Y</span>
          </span>
        </div>
        <svg className="block h-28 w-full" viewBox="0 0 320 110" preserveAspectRatio="none">
          <polyline
            points="0,86 40,80 80,82 120,70 160,64 200,58 240,46 280,40 320,30"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polygon
            points="0,86 40,80 80,82 120,70 160,64 200,58 240,46 280,40 320,30 320,110 0,110"
            fill="var(--foreground)"
            fillOpacity="0.06"
          />
          <circle cx="280" cy="40" r="3.5" fill="var(--foreground)" />
          <circle cx="320" cy="30" r="3.5" fill="var(--foreground)" />
        </svg>
      </div>
      <div className={CHART}>
        <div className="mb-2 flex items-center">
          <b className="text-[0.8125rem] font-semibold">Weekly volume · sets per muscle</b>
        </div>
        <div className="flex h-28 items-end gap-1.5 pt-2">
          {VOLUME_BARS.map((bar, i) => (
            <i
              key={i}
              className={cn("flex-1 rounded-t-[3px] bg-foreground", bar.lo ? "opacity-[0.25]" : "opacity-[0.85]")}
              style={{ height: `${bar.height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
