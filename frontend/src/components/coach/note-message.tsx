import { Video } from "lucide-react"

import type { CoachNote } from "@/hooks/use-coach-notes"
import { initials } from "@/lib/relative-time"
import { cn } from "@/lib/utils"

function timestamp(at: Date | null): string {
  if (!at) return ""
  return at.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function NoteMessage({ note, isMine }: { note: CoachNote; isMine: boolean }) {
  return (
    <li className={cn("flex gap-2", isMine && "flex-row-reverse")}>
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold text-muted-foreground">
        {initials(note.authorName)}
      </span>

      <div className={cn("min-w-0 max-w-[85%]", isMine && "text-right")}>
        <div
          className={cn(
            "inline-block rounded-lg px-2.5 py-1.5 text-left text-[0.8125rem] leading-snug whitespace-pre-wrap",
            isMine ? "bg-foreground text-background" : "bg-muted"
          )}
        >
          {note.body}
        </div>

        <div
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[0.6875rem] text-muted-foreground",
            isMine && "justify-end"
          )}
        >
          {!isMine && <span>{note.authorName}</span>}
          <span>{timestamp(note.createdAt)}</span>
          {note.setVideoId && (
            <span title="Attached to a set video" className="inline-flex items-center">
              <Video className="size-3" strokeWidth={2} />
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
