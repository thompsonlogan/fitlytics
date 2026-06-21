import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Exercise, ProgramDay } from "@/lib/program-data"

type NextSessionCardProps = {
  // nextDay is the next non-rest day after the viewed rest day, or null at the
  // end of the program.
  nextDay: ProgramDay | null
}

// How many exercises to list before collapsing the remainder into a single
// "+ N more" line — keeps the rest-day card compact.
const PREVIEW_COUNT = 3

// scheme renders a one-line prescription summary for an exercise's first block,
// e.g. "1×3 @ 300" or "2×6–10" when no absolute load is prescribed.
function scheme(exercise: Exercise): string {
  const block = exercise.blocks[0]
  if (!block) return ""
  const base = `${block.sets}×${block.reps}`
  return block.prescribedLoad != null ? `${base} @ ${block.prescribedLoad}` : base
}

export function NextSessionCard({ nextDay }: NextSessionCardProps) {
  const exercises = nextDay?.exercises ?? []
  const preview = exercises.slice(0, PREVIEW_COUNT)
  const overflow = exercises.length - preview.length

  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">Next session</CardTitle>
        <div className="flex-1" />
        {nextDay ? <span className="text-xs text-muted-foreground">{nextDay.tag}</span> : null}
      </CardHeader>
      <CardContent className="px-3.5 py-2 text-xs">
        {nextDay == null ? (
          <p className="m-0 py-1 text-muted-foreground">
            Program complete — no upcoming sessions.
          </p>
        ) : (
          <>
            {preview.map((ex) => (
              <NextLine key={ex.name} name={ex.name} scheme={scheme(ex)} />
            ))}
            {overflow > 0 ? (
              <NextLine name={`+ ${overflow} more`} scheme="" />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function NextLine({ name, scheme }: { name: string; scheme: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-muted-foreground">
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{name}</span>
      <span className="tabular-nums">{scheme}</span>
    </div>
  )
}
