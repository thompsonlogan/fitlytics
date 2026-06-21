import { useState } from "react"

import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type NotesCardProps = {
  // coachNotes is the read-only programming note (program_days.notes). Rendered
  // as bullets, one per non-blank line. null/empty → a muted placeholder.
  coachNotes?: string | null
  // yourNotes is the athlete's own note (sessions.notes). Editable: click to
  // edit, save on blur. Empty string when nothing's been written yet.
  yourNotes: string
  // onSaveYourNotes persists the edited note. The parent owns the session and
  // toasts on failure; this card just fires the save and exits edit mode.
  onSaveYourNotes: (value: string) => void | Promise<void>
  // tag is the day label shown on the right of the header (e.g. "Day 1").
  tag?: string
}

// splitBullets turns a free-text note into its non-blank lines. Trailing
// whitespace is trimmed so a stray newline doesn't render an empty bullet.
function splitBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function NotesCard({ coachNotes, yourNotes, onSaveYourNotes, tag }: NotesCardProps) {
  // editing drives the read↔edit swap for the "Your notes" section. draft holds
  // the in-flight text, seeded from yourNotes at edit-start so we never need an
  // effect to sync external changes back into local state.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const coachBullets = coachNotes ? splitBullets(coachNotes) : []
  const yourNotesEmpty = yourNotes.trim().length === 0

  const startEditing = () => {
    setDraft(yourNotes)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim().length === 0 ? "" : draft
    if (next !== yourNotes) {
      void onSaveYourNotes(next)
    }
  }

  return (
    <Card size="sm" className="flex min-h-0 flex-col gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">Notes</CardTitle>
        <div className="flex-1" />
        {tag ? <span className="text-xs text-muted-foreground">{tag}</span> : null}
      </CardHeader>

      <div className="min-h-0 flex-1 overflow-auto px-3.5 py-2.5 text-[0.8125rem] leading-relaxed">
        {/* Coach (read-only) */}
        <span className="mb-1 inline-block text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Coach
        </span>
        {coachBullets.length > 0 ? (
          <ul className="m-0 list-disc pl-4 [&_li]:mb-1 [&_li::marker]:text-muted-foreground">
            {coachBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-muted-foreground">No coach notes for this day.</p>
        )}

        {/* Your notes (editable) */}
        <span className="mt-4 mb-1 inline-block text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Your notes
        </span>
        {editing ? (
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            placeholder="Add a note about this workout…"
            aria-label="Your notes for this workout"
            className="min-h-20 text-[0.8125rem] leading-relaxed"
          />
        ) : yourNotesEmpty ? (
          <button
            type="button"
            onClick={startEditing}
            className="block w-full rounded-md border border-dashed border-border px-2.5 py-2 text-left text-muted-foreground hover:border-input hover:text-foreground"
          >
            Add a note about this workout…
          </button>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="block w-full rounded-md px-0 text-left whitespace-pre-wrap hover:text-foreground"
            aria-label="Edit your notes for this workout"
          >
            {yourNotes}
          </button>
        )}
      </div>
    </Card>
  )
}
