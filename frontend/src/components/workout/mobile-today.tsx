import { MobileAppBar } from "@/components/workout/mobile-app-bar"
import { MobileDayBoard, MobileDayBoardSkeleton } from "@/components/workout/mobile-day-board"
import { MobileSubBar } from "@/components/workout/mobile-sub-bar"
import { MobileTabBar } from "@/components/workout/mobile-tab-bar"
import { type Program, type ProgramDay } from "@/lib/program-data"
import { type MeResponse } from "@/services/generated"

type MobileTodayProps = {
  program: Program | undefined
  isLoading: boolean
  user: MeResponse | null
  onLogout: () => void
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

// MobileToday is the phone-width shell for the Today page. It receives the same
// program + selection state the desktop layout computes (from TodayPage) and
// arranges it as: sticky app bar → sub-bar → scrolling body (plan cards +
// summary/notes) → fixed bottom tab bar. Bottom padding clears the tab bar and
// the home-indicator safe area.
export function MobileToday({
  program,
  isLoading,
  user,
  onLogout,
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
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <MobileAppBar user={user} onLogout={onLogout} />
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

      <MobileTabBar />
    </div>
  )
}
