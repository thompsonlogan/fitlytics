import { MobileDayBoard, MobileDayBoardSkeleton } from "@/components/workout/mobile-day-board"
import { MobileSubBar } from "@/components/workout/mobile-sub-bar"
import { type Program, type ProgramDay } from "@/lib/program-data"

type MobileTodayProps = {
  program: Program | undefined
  isLoading: boolean
  programName: string
  weekCount: number
  days: ProgramDay[]
  week: number
  dayIndex: number
  todayWeek: number | null
  todayDayIndex: number | null
  dayData: ProgramDay
  startDate?: string
  completedDays: Record<string, boolean>
  prevDayId: string | null
  nextDay: ProgramDay | null
  onWeekChange: (next: number) => void
  onDayChange: (next: number) => void
}

export function MobileToday({
  program,
  isLoading,
  programName,
  weekCount,
  days,
  week,
  dayIndex,
  todayWeek,
  todayDayIndex,
  dayData,
  startDate,
  completedDays,
  prevDayId,
  nextDay,
  onWeekChange,
  onDayChange,
}: MobileTodayProps) {
  return (
    <>
      <MobileSubBar
        programName={programName}
        weekCount={weekCount}
        days={days}
        week={week}
        dayIndex={dayIndex}
        todayWeek={todayWeek}
        todayDayIndex={todayDayIndex}
        dayData={dayData}
        startDate={startDate}
        completedDays={completedDays}
        onWeekChange={onWeekChange}
        onDayChange={onDayChange}
      />

      <main
        className="flex-1 px-3.5 pt-3.5"
        style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      >
        {isLoading || !program ? (
          <MobileDayBoardSkeleton />
        ) : (
          <MobileDayBoard
            key={`${week}-${dayIndex}`}
            day={dayData}
            programId={program.id}
            programDayId={dayData.id}
            prevDayId={prevDayId}
            nextDay={nextDay}
          />
        )}

        <div className="mt-3 flex items-center justify-center gap-2 py-1 text-[0.625rem] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>Synced</span>
          <span className="text-border">·</span>
          <span>Fitlytics v0.0.1</span>
        </div>
      </main>
    </>
  )
}
