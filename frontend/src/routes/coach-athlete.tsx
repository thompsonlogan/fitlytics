import { useMemo, useState } from "react"

import { Link, useParams } from "@tanstack/react-router"

import { buttonVariants } from "@/components/ui/button"
import { AthleteSummaryCard } from "@/components/coach/athlete-summary-card"
import { CoachSessionView } from "@/components/coach/coach-session-view"
import { NotesPanel } from "@/components/coach/notes-panel"
import { VideoReviewDialog } from "@/components/coach/video-review-dialog"
import { SubBar } from "@/components/workout/sub-bar"
import { useAuth } from "@/hooks/use-auth"
import { useCoachAthleteProgram } from "@/hooks/use-coach-athlete-program"
import { useCoachSession } from "@/hooks/use-coach-session"
import { useDayCompletions } from "@/hooks/use-day-completions"
import { computeTodayPosition, type ProgramDay } from "@/lib/program-data"
import { cn } from "@/lib/utils"

const PLACEHOLDER_DAY: ProgramDay = { id: "", name: "Loading…", tag: "—" }

export function CoachAthletePage() {
  const { athleteId } = useParams({ from: "/coach/coach/athletes/$athleteId" })
  const { athlete, program, isLoading, isError, notFound } = useCoachAthleteProgram(athleteId)
  const { user } = useAuth()
  const { data: dayCompletions } = useDayCompletions(program?.id)

  const weekCount = program?.weeks.length ?? 0

  const athletePos = useMemo(
    () => (program?.startDate ? computeTodayPosition(program.startDate, weekCount) : null),
    [program, weekCount]
  )

  const [selected, setSelected] = useState<{ week: number; dayIndex: number } | null>(null)
  const week = selected?.week ?? athletePos?.week ?? 1
  const dayIndex = selected?.dayIndex ?? athletePos?.dayIndex ?? 0

  const activeWeek =
    program && weekCount > 0
      ? (program.weeks[Math.min(week, weekCount) - 1] ?? program.weeks[0])
      : undefined

  const days = activeWeek?.days ?? []
  const dayData = days[dayIndex] ?? PLACEHOLDER_DAY

  const { actualsFor, notStarted, session, blockLogsByKey, videosBySetLogId, videosError } =
    useCoachSession(program?.id, dayData.id || undefined)

  const selectWeek = (nextWeek: number) => {
    const nextDays = program?.weeks[Math.min(nextWeek, weekCount) - 1]?.days ?? []
    const clamped = nextDays.length > 0 ? Math.min(dayIndex, nextDays.length - 1) : 0
    setSelected({ week: nextWeek, dayIndex: clamped })
  }

  const [videoRowKey, setVideoRowKey] = useState<string | null>(null)

  const videoBlock = (() => {
    if (!videoRowKey) return null
    const [exIdx, blIdx] = videoRowKey.split("-").map(Number)
    const exercise = dayData.exercises?.[exIdx!]
    const block = exercise?.blocks[blIdx!]
    return exercise && block ? { exercise, block, exIdx: exIdx! } : null
  })()

  if (notFound) {
    return (
      <CoachAthleteMessage
        title="Athlete not found"
        body="You don't coach this athlete, or the link has ended."
      />
    )
  }

  if (isError) {
    return (
      <CoachAthleteMessage
        title="Could not load this athlete"
        body="Something went wrong fetching their program. Refresh to try again."
      />
    )
  }

  if (!isLoading && athlete && !athlete.programId) {
    return (
      <CoachAthleteMessage
        title={`${athlete.displayName} has no program`}
        body="There is nothing to review until they are assigned one."
      />
    )
  }

  return (
    <div
      className="flex flex-col md:grid md:min-h-0"
      style={{ gridTemplateRows: "auto minmax(0,1fr)" }}
    >
      <SubBar
        breadcrumb={[
          { label: "Athletes", to: "/coach" },
          { label: athlete?.displayName ?? "Loading…" },
          { label: program?.name ?? "…" },
        ]}
        weekCount={Math.max(1, weekCount)}
        days={days}
        week={week}
        dayIndex={dayIndex}
        todayWeek={athletePos?.week ?? null}
        todayDayIndex={athletePos?.dayIndex ?? null}
        dayData={dayData}
        startDate={program?.startDate}
        completedDays={dayCompletions ?? {}}
        onWeekChange={selectWeek}
        onDayChange={(next) => setSelected({ week, dayIndex: next })}
        onResetToToday={() => setSelected(null)}
      />

      <main className="grid grid-cols-1 gap-3 px-3.5 py-3.5 md:min-h-0 md:gap-4 md:overflow-auto md:px-5 md:py-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-h-0">
          <CoachSessionView
            key={`${week}-${dayIndex}`}
            day={dayData}
            isLoading={isLoading}
            actualsFor={actualsFor}
            onOpenVideo={setVideoRowKey}
          />

          {!isLoading && !dayData.off && notStarted && (
            <p className="mt-2 text-[0.75rem] text-muted-foreground">
              {athlete?.displayName} hasn't logged this session — every actual below is still blank.
            </p>
          )}

          {videosError && (
            <p className="mt-2 text-[0.75rem] text-amber-600 dark:text-amber-400">
              Couldn't load this session's videos — the counts below may be understated. Reopen the
              day to retry.
            </p>
          )}
        </div>

        {athlete && (
          <aside className="flex min-h-0 min-w-0 flex-col gap-3">
            <AthleteSummaryCard athlete={athlete} />
            <NotesPanel
              linkId={athlete.linkId}
              currentUserId={user?.id}
              className="max-h-96 md:max-h-none"
            />
          </aside>
        )}
      </main>

      {videoBlock && (
        <VideoReviewDialog
          open
          onClose={() => setVideoRowKey(null)}
          exercise={videoBlock.exercise}
          exNum={videoBlock.exIdx + 1}
          block={videoBlock.block}
          blockLogs={blockLogsByKey.get(videoRowKey!) ?? []}
          videosBySetLogId={videosBySetLogId}
          sessionId={session?.id}
          linkId={athlete?.linkId}
        />
      )}
    </div>
  )
}

function CoachAthleteMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid flex-1 place-items-center px-6 py-16">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
        <Link to="/coach" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to roster
        </Link>
      </div>
    </main>
  )
}
