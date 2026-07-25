import { Video } from "lucide-react"

import { cn } from "@/lib/utils"

type CoachVideoCellProps = {
  total: number
  unreviewed: number
  exerciseName: string
  onOpen: () => void
}

export function CoachVideoCell({ total, unreviewed, exerciseName, onOpen }: CoachVideoCellProps) {
  if (total === 0) {
    return <span className="text-muted-foreground/40">—</span>
  }

  const waiting = unreviewed > 0
  const label = waiting ? `${unreviewed} of ${total} awaiting review` : `${total} reviewed`

  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      aria-label={`${exerciseName}: ${label}`}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-sm px-1.5 transition-colors",
        waiting
          ? "bg-foreground text-background hover:bg-foreground/90"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Video className="size-3.5" strokeWidth={1.75} />
      <span className="text-[0.625rem] font-semibold tabular-nums">
        {waiting ? unreviewed : total}
      </span>
    </button>
  )
}
