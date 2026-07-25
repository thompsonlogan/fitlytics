import { LoadCellInput } from "@/components/workout/load-cell-input"
import { RpeCellInput } from "@/components/workout/rpe-cell-input"
import { SetStateCell } from "@/components/workout/set-state-cell"
import { type SetState } from "@/components/workout/set-state"
import { VideoCell } from "@/components/workout/video-cell"
import { formatReps, type Exercise } from "@/lib/program-data"
import { cn } from "@/lib/utils"

// MobileExerciseCard is the phone reflow of one exercise's workout-table rows.
// The desktop table is block-granular (one row per "3×5" block), so this card
// mirrors that: a header, then one tappable block row each carrying the same
// tri-state check, load/RPE inputs and video trigger — driven by the identical
// keyed state + handlers the table uses (`${exIdx}-${blIdx}`).
type MobileExerciseCardProps = {
  exercise: Exercise
  exIdx: number
  exNum: number
  cellState: Record<string, SetState>
  loadEdits: Record<string, string>
  rpeEdits: Record<string, string>
  persistedLoad: Record<string, number | "">
  persistedRpe: Record<string, number | null>
  cellErrors: Record<string, string>
  videoInfo: Record<string, { filmedCount: number; firstFilmedSet: number | null }>
  onCycleSet: (key: string) => void
  onEditLoad: (key: string, value: string) => void
  onEditRpe: (key: string, value: string) => void
  onBlurLoad: (key: string, value: string) => void
  onBlurRpe: (key: string, value: string) => void
  onOpenVideo: (key: string, initialSet: number) => void
}

export function MobileExerciseCard({
  exercise,
  exIdx,
  exNum,
  cellState,
  loadEdits,
  rpeEdits,
  persistedLoad,
  persistedRpe,
  cellErrors,
  videoInfo,
  onCycleSet,
  onEditLoad,
  onEditRpe,
  onBlurLoad,
  onBlurRpe,
  onOpenVideo,
}: MobileExerciseCardProps) {
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
        const state = cellState[key] ?? "pending"
        const done = state === "completed" || state === "skipped"

        const info = videoInfo[key] ?? { filmedCount: 0, firstFilmedSet: null }

        return (
          <div key={key} className="flex flex-col gap-2.5 border-t px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <SetStateCell
                state={state}
                onCycle={() => onCycleSet(key)}
                ariaLabel={`${exercise.name} block ${blIdx + 1}: ${state}. Tap to cycle.`}
                className="size-[1.375rem] rounded-md"
                iconClassName="size-3.5"
              />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "flex items-baseline gap-2",
                    done && "text-muted-foreground line-through"
                  )}
                >
                  <span className="text-sm font-semibold tabular-nums">
                    {block.sets}
                    <span className="mx-0.5 font-normal text-muted-foreground">×</span>
                    {formatReps(block.repsMin, block.repsMax)}
                  </span>
                  <span className="truncate text-[0.8125rem] tabular-nums">{block.intensity}</span>
                </div>
                {block.cap !== "" && (
                  <div className="mt-0.5 text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                    Cap {block.cap}
                  </div>
                )}
              </div>
              <VideoCell
                filmedCount={info.filmedCount}
                totalSets={block.sets}
                firstFilmedSet={info.firstFilmedSet}
                exerciseName={exercise.name}
                onOpen={(initialSet) => onOpenVideo(key, initialSet)}
              />
            </div>

            <div className="flex items-center gap-2 pl-[1.875rem]">
              <label className="inline-flex items-center gap-1.5">
                <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  Load
                </span>
                <LoadCellInput
                  cellKey={key}
                  edited={loadEdits[key]}
                  persisted={persistedLoad[key]}
                  error={cellErrors[`${key}:load`]}
                  onEdit={onEditLoad}
                  onBlur={onBlurLoad}
                  className="h-8 w-16 border-input bg-background px-2 text-right text-[0.8125rem] tabular-nums shadow-none"
                />
              </label>

              <div className="flex-1" />

              <label className="inline-flex items-center gap-1.5">
                <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  RPE
                </span>
                <RpeCellInput
                  cellKey={key}
                  edited={rpeEdits[key]}
                  persisted={persistedRpe[key]}
                  error={cellErrors[`${key}:rpe`]}
                  ariaLabel={`RPE for ${exercise.name} block ${blIdx + 1}`}
                  onEdit={onEditRpe}
                  onBlur={onBlurRpe}
                  className="h-8 w-12 rounded-full border-transparent bg-muted px-2 text-center text-[0.8125rem] font-medium tabular-nums shadow-none focus-visible:bg-background"
                  emptyClassName="border border-dashed border-border bg-transparent text-muted-foreground"
                />
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}
