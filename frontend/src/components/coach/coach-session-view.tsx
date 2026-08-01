import { CoachWorkoutTable } from "@/components/coach/coach-workout-table"
import { CoachWorkoutTableSkeleton } from "@/components/coach/coach-workout-table-skeleton"
import {
  MobileCoachWorkoutTable,
  MobileCoachWorkoutTableSkeleton,
} from "@/components/coach/mobile-coach-workout-table"
import { RestDayCard } from "@/components/workout/workout-table"
import type { BlockActuals } from "@/hooks/use-coach-session"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { type ProgramDay } from "@/lib/program-data"

type CoachSessionViewProps = {
  day: ProgramDay
  isLoading: boolean
  actualsFor: (key: string) => BlockActuals
  onOpenVideo: (key: string) => void
}

export function CoachSessionView({
  day,
  isLoading,
  actualsFor,
  onOpenVideo,
}: CoachSessionViewProps) {
  const isMobile = useIsMobile()

  if (isLoading) {
    return isMobile ? <MobileCoachWorkoutTableSkeleton /> : <CoachWorkoutTableSkeleton />
  }

  if (day.off) {
    return <RestDayCard name={day.name} />
  }

  return isMobile ? (
    <MobileCoachWorkoutTable day={day} actualsFor={actualsFor} onOpenVideo={onOpenVideo} />
  ) : (
    <CoachWorkoutTable day={day} actualsFor={actualsFor} onOpenVideo={onOpenVideo} />
  )
}
