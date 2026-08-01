import { Video } from "lucide-react"

import { cn } from "@/lib/utils"

export function VideosWaitingCell({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[0.8125rem] tabular-nums",
        count > 0 ? "font-medium text-foreground" : "text-muted-foreground"
      )}
    >
      <Video className="size-3.5" strokeWidth={1.75} />
      {count}
    </span>
  )
}
