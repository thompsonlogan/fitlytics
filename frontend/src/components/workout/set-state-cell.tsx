import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { type SetState } from "@/components/workout/set-state"

type SetStateCellProps = {
  state: SetState
  ariaLabel: string
  onCycle: () => void
  // className overrides the button box — the mobile card list passes a larger
  // size and rounding for a comfortable touch target.
  className?: string
  // iconClassName scales the check / X glyph to match an enlarged box.
  iconClassName?: string
}

// SetStateCell is the per-row tri-state button that replaces the old binary
// checkbox. Single click cycles pending → completed → skipped → pending; the
// parent (day-board) handles the debounced PATCH so multiple quick clicks
// only fire one network call with the final state.
export function SetStateCell({ state, ariaLabel, onCycle, className, iconClassName }: SetStateCellProps) {
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={ariaLabel}
      aria-pressed={state !== "pending"}
      data-state={state}
      title={state === "pending" ? "Mark complete" : state === "completed" ? "Mark skipped" : "Mark pending"}
      className={cn(
        "inline-flex size-4 items-center justify-center rounded-sm border transition-colors",
        state === "pending" && "border-input bg-background hover:bg-muted",
        state === "completed" && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        state === "skipped" && "border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25",
        className
      )}
    >
      {state === "completed" && <Check className={cn("size-3", iconClassName)} strokeWidth={3} />}
      {state === "skipped" && <X className={cn("size-3", iconClassName)} strokeWidth={3} />}
    </button>
  )
}
