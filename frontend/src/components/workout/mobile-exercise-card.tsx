import { Input } from "@/components/ui/input"
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

        const loadEdited = loadEdits[key]
        const loadPersisted = persistedLoad[key]
        const loadFallback =
          loadPersisted == null || loadPersisted === "" ? "" : String(loadPersisted)
        const loadValue = loadEdited != null ? loadEdited : loadFallback
        const loadErr = cellErrors[`${key}:load`]

        const rpeEdited = rpeEdits[key]
        const rpePersisted = persistedRpe[key]
        const rpeFallback = rpePersisted == null ? "" : String(rpePersisted)
        const rpeValue = rpeEdited != null ? rpeEdited : rpeFallback
        const rpeErr = cellErrors[`${key}:rpe`]

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
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Input
                    value={loadValue}
                    onChange={(e) => onEditLoad(key, e.target.value)}
                    onBlur={(e) => onBlurLoad(key, e.target.value)}
                    placeholder="—"
                    inputMode="numeric"
                    maxLength={4}
                    title={loadErr}
                    aria-invalid={!!loadErr}
                    data-testid={`load-input-${key}`}
                    className={cn(
                      "h-8 w-16 border-input bg-background px-2 text-right text-[0.8125rem] tabular-nums shadow-none",
                      loadValue === "" && "text-muted-foreground",
                      loadErr && "border-destructive bg-destructive/10 text-destructive"
                    )}
                  />
                  <span className="text-xs text-muted-foreground">lb</span>
                </span>
              </label>

              <div className="flex-1" />

              <label className="inline-flex items-center gap-1.5">
                <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  RPE
                </span>
                <Input
                  value={rpeValue}
                  onChange={(e) => onEditRpe(key, e.target.value)}
                  onBlur={(e) => onBlurRpe(key, e.target.value)}
                  placeholder="—"
                  inputMode="numeric"
                  maxLength={2}
                  aria-label={`RPE for ${exercise.name} block ${blIdx + 1}`}
                  aria-invalid={!!rpeErr}
                  title={rpeErr}
                  data-testid={`rpe-input-${key}`}
                  className={cn(
                    "h-8 w-12 rounded-full border-transparent bg-muted px-2 text-center text-[0.8125rem] font-medium tabular-nums shadow-none focus-visible:bg-background",
                    rpeValue === "" &&
                      "border border-dashed border-border bg-transparent text-muted-foreground",
                    rpeErr && "border border-destructive bg-destructive/10 text-destructive"
                  )}
                />
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}
