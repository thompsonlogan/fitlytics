import { BlockStateIcon } from "@/components/coach/block-state-icon"
import { CoachVideoCell } from "@/components/coach/coach-video-cell"
import { DeviationChip } from "@/components/coach/deviation-chip"
import { RpePairCell } from "@/components/coach/rpe-pair-cell"
import type { BlockActuals } from "@/hooks/use-coach-session"
import { formatReps, type Exercise } from "@/lib/program-data"

type MobileCoachExerciseCardProps = {
  exercise: Exercise
  exIdx: number
  exNum: number
  actualsFor: (key: string) => BlockActuals
  onOpenVideo: (key: string) => void
}

export function MobileCoachExerciseCard({
  exercise,
  exIdx,
  exNum,
  actualsFor,
  onOpenVideo,
}: MobileCoachExerciseCardProps) {
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <span className="mt-px inline-flex size-5 flex-none items-center justify-center rounded-full bg-muted text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
          {exNum}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tracking-tight">{exercise.name}</div>
          <div className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            {exercise.sub ? `${exercise.sub} · ` : ""}rest {exercise.rest} min
          </div>
        </div>
      </div>

      {exercise.blocks.map((block, blIdx) => {
        const key = `${exIdx}-${blIdx}`
        const actual = actualsFor(key)

        return (
          <div key={key} className="flex flex-col gap-2 border-t px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <BlockStateIcon state={actual.state} className="flex-none" />
              <span className="flex-none text-sm font-semibold tabular-nums">
                {block.sets}
                <span className="mx-0.5 font-normal text-muted-foreground">×</span>
                {formatReps(block.repsMin, block.repsMax)}
                {actual.repsActual != null && actual.repsActual !== 0 && (
                  <span className="ml-1 text-[0.6875rem] font-normal text-muted-foreground">
                    ({actual.repsActual})
                  </span>
                )}
              </span>
              <span className="truncate text-[0.75rem] text-muted-foreground tabular-nums">
                {block.intensity}
              </span>
              <span className="ml-auto flex-none text-[0.75rem] text-muted-foreground tabular-nums">
                <span className="mr-1 text-[0.5625rem] font-semibold tracking-wider uppercase">
                  target
                </span>
                {block.prescribedLoad ?? "—"}
              </span>
            </div>

            <div className="flex items-center gap-2.5 pl-6">
              {actual.loadLb == null ? (
                <span className="text-[0.8125rem] text-muted-foreground">Not logged</span>
              ) : (
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold tabular-nums">{actual.loadLb}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">lb</span>
                  <DeviationChip target={block.prescribedLoad} actual={actual.loadLb} />
                </span>
              )}

              <span className="ml-auto flex flex-none items-center gap-2.5">
                <RpePairCell target={block.rpe} actual={actual.rpe} />
                <CoachVideoCell
                  total={actual.videosTotal}
                  unreviewed={actual.videosUnreviewed}
                  exerciseName={exercise.name}
                  onOpen={() => onOpenVideo(key)}
                />
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
