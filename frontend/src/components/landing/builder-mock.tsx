import { GripVertical, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const ROW =
  "flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-[0.8125rem]"
const GRIP = "inline-flex cursor-grab text-muted-foreground [&_svg]:size-[0.9375rem]"
const TAG = "h-auto rounded-[4px] px-[0.4375rem] py-px font-mono text-[0.6875rem] font-normal text-muted-foreground"
const SCHEME = "font-mono text-xs text-muted-foreground tabular-nums"

// Static drag-and-drop program builder preview for the program-building
// feature row. Decorative only.
export function BuilderMock() {
  return (
    <div className="grid gap-2.5 bg-background p-4">
      <div className="flex items-center gap-1 px-1 pb-1 font-mono text-[0.6875rem] tracking-[0.06em] text-muted-foreground uppercase">
        <span>Day 1 · Lower</span>
        <Separator className="flex-1" />
        <span>4 wk block</span>
      </div>
      <div className={ROW}>
        <span className={GRIP}>
          <GripVertical />
        </span>
        <span className="flex-1 font-medium">Comp Squat</span>
        <Badge variant="secondary" className={TAG}>% 1RM</Badge>
        <span className={SCHEME}>3×5 @ 0.95</span>
      </div>
      <div className={ROW}>
        <span className={GRIP}>
          <GripVertical />
        </span>
        <span className="flex-1 font-medium">Comp Deadlift</span>
        <Badge variant="secondary" className={TAG}>% 1RM</Badge>
        <span className={SCHEME}>3×3 @ 0.90</span>
      </div>
      <div className={cn(ROW, "border-dashed bg-muted text-muted-foreground")}>
        <span className={GRIP}>
          <GripVertical />
        </span>
        <span className="flex-1 font-medium">SL Quad Extension</span>
        <span className={SCHEME}>2×6–10</span>
      </div>
      <div className={ROW}>
        <span className={GRIP}>
          <GripVertical />
        </span>
        <span className="flex-1 font-medium">SL Hamstring Curl</span>
        <Badge variant="secondary" className={TAG}>RIR</Badge>
        <span className={SCHEME}>2×6–10</span>
      </div>
      <div className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border p-2.5 text-[0.8125rem] text-muted-foreground [&_svg]:size-[0.875rem]">
        <Plus /> Add exercise
      </div>
    </div>
  )
}
