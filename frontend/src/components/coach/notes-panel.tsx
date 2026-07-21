import { useEffect, useRef, useState } from "react"

import { SendHorizontal } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { NoteMessage } from "@/components/coach/note-message"
import { MAX_NOTE_LENGTH, useCoachNotes, usePostCoachNote } from "@/hooks/use-coach-notes"

type NotesPanelProps = {
  linkId: string | undefined
  currentUserId: string | undefined
}

export function NotesPanel({ linkId, currentUserId }: NotesPanelProps) {
  const { data: notes, isLoading, isError } = useCoachNotes(linkId)
  const postNote = usePostCoachNote(linkId)
  const [draft, setDraft] = useState("")

  // The thread renders oldest-first, so the newest note sits below the fold.
  // Pin the view to the bottom on load and whenever a new note arrives — keyed
  // on the last note's id, not the count, so a full page that drops its oldest
  // as it gains a newest still scrolls.
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastNoteId = notes?.[notes.length - 1]?.id
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [lastNoteId])

  const trimmed = draft.trim()
  const canSend = trimmed.length > 0 && !postNote.isPending

  const send = async () => {
    if (!canSend) return
    try {
      await postNote.mutateAsync({ body: trimmed })
      setDraft("")
    } catch {
      toast.error("Couldn't post your note. Check your connection and try again.")
    }
  }

  // A counter only once the note is getting long, so it's not visual noise.
  const remaining = MAX_NOTE_LENGTH - draft.length
  const showCount = remaining <= 200

  return (
    <Card size="sm" className="flex min-h-0 flex-col gap-0 py-0">
      <CardHeader className="border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">Notes</CardTitle>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 py-3">
        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <p className="text-[0.75rem] text-muted-foreground">Loading the thread…</p>
          ) : isError ? (
            <p className="text-[0.75rem] text-muted-foreground">
              Couldn't load the thread. Refresh to try again.
            </p>
          ) : !notes || notes.length === 0 ? (
            <p className="text-[0.75rem] text-muted-foreground">
              No notes yet. Anything you write here is visible to the athlete.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {notes.map((note) => (
                <NoteMessage
                  key={note.id}
                  note={note}
                  isMine={!!currentUserId && note.authorUserId === currentUserId}
                />
              ))}
              <div ref={bottomRef} />
            </ul>
          )}
        </div>

        <div className="flex items-end gap-1.5 border-t pt-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder="Write a note…"
              aria-label="Write a note"
              rows={2}
              maxLength={MAX_NOTE_LENGTH}
              className="min-h-0 resize-none text-[0.8125rem]"
            />
            {showCount && (
              <span className="self-end text-[0.6875rem] text-muted-foreground tabular-nums">
                {remaining}
              </span>
            )}
          </div>
          <Button size="sm" onClick={() => void send()} disabled={!canSend} aria-label="Post note">
            <SendHorizontal className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
