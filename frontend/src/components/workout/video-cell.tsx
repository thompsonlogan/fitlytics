import { Video } from "lucide-react"

import { cn } from "@/lib/utils"

type VideoCellProps = {
  filmedCount: number
  totalSets: number
  // Index of the first filmed set, so a click on a filled cell opens straight
  // into review; null when nothing is filmed (opens the first set to upload).
  firstFilmedSet: number | null
  exerciseName: string
  onOpen: (initialSet: number) => void
}

// VideoCell is the always-visible per-row trigger in the table's video column.
// Outline icon = nothing filmed; solid = at least one clip; a `filmed/total`
// fraction shows only while a multi-set block is partially filmed.
export function VideoCell({
  filmedCount,
  totalSets,
  firstFilmedSet,
  exerciseName,
  onOpen,
}: VideoCellProps) {
  const has = filmedCount > 0
  const full = has && filmedCount >= totalSets
  const title = has
    ? full
      ? "Review videos"
      : `Review · ${filmedCount}/${totalSets} sets filmed`
    : totalSets > 1
      ? "Add a video for a set"
      : "Add a video"

  return (
    <button
      type="button"
      onClick={() => onOpen(firstFilmedSet ?? 0)}
      title={title}
      aria-label={`${exerciseName}: ${title}`}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-sm border border-transparent px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        has && "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
      )}
    >
      <Video className="size-3.5" strokeWidth={1.75} />
      {has && !full ? (
        <span className="text-[0.625rem] font-semibold tabular-nums">
          {filmedCount}/{totalSets}
        </span>
      ) : null}
    </button>
  )
}
