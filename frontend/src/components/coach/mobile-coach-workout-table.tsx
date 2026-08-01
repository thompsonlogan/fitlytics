import { MobileCoachExerciseCard } from "@/components/coach/mobile-coach-exercise-card"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { BlockActuals } from "@/hooks/use-coach-session"
import { totalSets, type ProgramDay } from "@/lib/program-data"

type MobileCoachWorkoutTableProps = {
  day: ProgramDay
  actualsFor: (key: string) => BlockActuals
  onOpenVideo: (key: string) => void
}

export function MobileCoachWorkoutTable({
  day,
  actualsFor,
  onOpenVideo,
}: MobileCoachWorkoutTableProps) {
  const exercises = day.exercises ?? []

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">Prescribed vs actual</CardTitle>
        <span className="text-xs text-muted-foreground">
          {exercises.length} exercises · {totalSets(day)} working sets
        </span>
      </CardHeader>

      <div className="flex flex-col gap-2.5 p-3">
        {exercises.map((exercise, exIdx) => (
          <MobileCoachExerciseCard
            key={`${exIdx}-${exercise.name}`}
            exercise={exercise}
            exIdx={exIdx}
            exNum={exIdx + 1}
            actualsFor={actualsFor}
            onOpenVideo={onOpenVideo}
          />
        ))}
      </div>
    </Card>
  )
}

export function MobileCoachWorkoutTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="gap-0 py-0" data-testid="mobile-coach-workout-skeleton">
      <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
        <Skeleton className="h-3.5 w-32" />
      </CardHeader>
      <div className="flex flex-col gap-2.5 p-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="rounded-md border p-3">
            <Skeleton className="mb-2 h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
            <div className="mt-3 flex items-center gap-2.5">
              <Skeleton className="size-3.5 rounded-sm" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-auto h-4 w-10" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
