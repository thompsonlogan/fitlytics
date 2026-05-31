import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"

// SetState mirrors the backend set_log_state enum. "pending" is the default
// after a session is created; the user cycles into "completed" or "skipped"
// by clicking the cell.
export type SetState = "pending" | "completed" | "skipped"

export const CYCLE_NEXT: Record<SetState, SetState> = {
  pending: "completed",
  completed: "skipped",
  skipped: "pending",
}

type SetStateCellProps = {
  state: SetState
  ariaLabel: string
  onCycle: () => void
}

// SetStateCell is the per-row tri-state button that replaces the old binary
// checkbox. Single click cycles pending → completed → skipped → pending; the
// parent (day-board) handles the debounced PATCH so multiple quick clicks
// only fire one network call with the final state.
export function SetStateCell({ state, ariaLabel, onCycle }: SetStateCellProps) {
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
        state === "skipped" && "border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25"
      )}
    >
      {state === "completed" && <Check className="size-3" strokeWidth={3} />}
      {state === "skipped" && <X className="size-3" strokeWidth={3} />}
    </button>
  )
}
