package coaching

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

var refNow = time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)

func newRosterService(repo Repository) Service {
	return &service{repo: repo, now: func() time.Time { return refNow }}
}

func rosterRepo(athletes []RosterAthlete) *fakeRepository {
	return &fakeRepository{
		listActiveAthletesFn: func(context.Context, uuid.UUID) ([]RosterAthlete, error) {
			return athletes, nil
		},
	}
}

func oneAthlete() []RosterAthlete {
	return []RosterAthlete{{AthleteUserID: athleteID, DisplayName: "Marcus Webb"}}
}

// ─── compliance ─────────────────────────────────────────────────────────────

func TestCompliancePct(t *testing.T) {
	for _, tc := range []struct {
		name      string
		completed int64
		due       int64
		want      *int32
	}{
		{"nothing due is unknown, not zero", 0, 0, nil},
		{"none of four completed is a real zero", 0, 4, ptr(int32(0))},
		{"all completed", 4, 4, ptr(int32(100))},
		{"three of four", 3, 4, ptr(int32(75))},
		{"rounds to nearest", 2, 3, ptr(int32(67))},
		{"extra sessions cap at 100", 6, 4, ptr(int32(100))},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := compliancePct(tc.completed, tc.due)

			switch {
			case tc.want == nil && got != nil:
				t.Errorf("want nil, got %d", *got)
			case tc.want != nil && got == nil:
				t.Errorf("want %d, got nil", *tc.want)
			case tc.want != nil && *got != *tc.want:
				t.Errorf("want %d, got %d", *tc.want, *got)
			}
		})
	}
}

// ─── attendance ─────────────────────────────────────────────────────────────

func TestDueSessions(t *testing.T) {
	start := refNow.AddDate(0, 0, -15)
	since := refNow.AddDate(0, 0, -metricsWindowDays)

	week := func(n int32) []ScheduledDay {
		days := make([]ScheduledDay, 0, 7)
		for d := int32(1); d <= 7; d++ {
			days = append(days, ScheduledDay{WeekSequence: n, DaySequence: d, IsRestDay: d > 4})
		}
		return days
	}
	fourWeeks := append(append(append(week(1), week(2)...), week(3)...), week(4)...)

	for _, tc := range []struct {
		name string
		prog RosterProgram
		days []ScheduledDay
		want int64
	}{
		{"mid block counts elapsed training days", RosterProgram{StartDate: &start}, fourWeeks, 10},
		{"rest days never count", RosterProgram{StartDate: &start}, []ScheduledDay{
			{WeekSequence: 1, DaySequence: 1, IsRestDay: true},
			{WeekSequence: 1, DaySequence: 2, IsRestDay: true},
		}, 0},
		{"days still in the future are not due", RosterProgram{StartDate: &start}, week(4), 0},
		{"no start date means nothing is due", RosterProgram{}, fourWeeks, 0},
		{"no schedule means nothing is due", RosterProgram{StartDate: &start}, nil, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := dueSessions(tc.prog, tc.days, since, refNow); got != tc.want {
				t.Errorf("want %d due, got %d", tc.want, got)
			}
		})
	}
}

func TestDueSessions_ExcludesDaysBeforeTheWindow(t *testing.T) {
	start := refNow.AddDate(0, 0, -60)
	since := refNow.AddDate(0, 0, -metricsWindowDays)

	days := []ScheduledDay{
		{WeekSequence: 1, DaySequence: 1}, // day 0 — long before the window
		{WeekSequence: 8, DaySequence: 1}, // day 49 — inside the window
	}

	if got := dueSessions(RosterProgram{StartDate: &start}, days, since, refNow); got != 1 {
		t.Errorf("want only the in-window day to count, got %d", got)
	}
}

// ─── status derivation ──────────────────────────────────────────────────────

func TestDeriveStatus(t *testing.T) {
	for _, tc := range []struct {
		name        string
		hasSessions bool
		compliance  *int32
		want        string
	}{
		{"never trained", false, nil, AthleteStatusNew},
		{"trained but no sets in window", true, nil, AthleteStatusOnTrack},
		{"just below the threshold", true, ptr(int32(79)), AthleteStatusAttention},
		{"exactly at the threshold", true, ptr(int32(80)), AthleteStatusOnTrack},
		{"perfect", true, ptr(int32(100)), AthleteStatusOnTrack},
		{"zero compliance", true, ptr(int32(0)), AthleteStatusAttention},
		{"no sessions wins over compliance", false, ptr(int32(0)), AthleteStatusNew},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := deriveStatus(tc.hasSessions, tc.compliance); got != tc.want {
				t.Errorf("want %q, got %q", tc.want, got)
			}
		})
	}
}

// ─── week positioning ───────────────────────────────────────────────────────

func TestCurrentWeek(t *testing.T) {
	day := func(offset int) *time.Time {
		d := refNow.AddDate(0, 0, offset)
		return &d
	}

	for _, tc := range []struct {
		name string
		prog RosterProgram
		want int32
	}{
		{"started today", RosterProgram{StartDate: day(0), WeekCount: 4}, 1},
		{"day 6 is still week 1", RosterProgram{StartDate: day(-6), WeekCount: 4}, 1},
		{"day 7 rolls to week 2", RosterProgram{StartDate: day(-7), WeekCount: 4}, 2},
		{"mid block", RosterProgram{StartDate: day(-15), WeekCount: 4}, 3},
		{"final week", RosterProgram{StartDate: day(-21), WeekCount: 4}, 4},
		{"overrun clamps to the last week", RosterProgram{StartDate: day(-90), WeekCount: 4}, 4},
		{"future start reads as week 1", RosterProgram{StartDate: day(14), WeekCount: 4}, 1},
		{"no start date reads as week 1", RosterProgram{WeekCount: 4}, 1},
		{"program with no weeks", RosterProgram{StartDate: day(-7)}, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := currentWeek(tc.prog, refNow); got != tc.want {
				t.Errorf("want week %d, got %d", tc.want, got)
			}
		})
	}
}

// Program recency (latest-per-athlete) now lives in the DISTINCT ON ordering of
// LatestProgramByUser's SQL rather than a Go helper, so it is exercised against
// a real database instead of here.

// ─── GetRoster ──────────────────────────────────────────────────────────────

func TestGetRoster_NoAthletesSkipsAllMetricQueries(t *testing.T) {
	repo := rosterRepo(nil)

	got, err := newRosterService(repo).GetRoster(context.Background(), coachID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Errorf("want empty non-nil slice, got %v", got)
	}
	if repo.programCalls+repo.metricsCalls+repo.videoCalls != 0 {
		t.Error("metric queries should be skipped when the coach has no athletes")
	}
}

func TestGetRoster_QueriesAllAthletesAtOnce(t *testing.T) {
	second := fixedID("user:athlete2")
	repo := rosterRepo([]RosterAthlete{
		{AthleteUserID: athleteID, DisplayName: "Marcus Webb"},
		{AthleteUserID: second, DisplayName: "Priya Nair"},
	})

	if _, err := newRosterService(repo).GetRoster(context.Background(), coachID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if repo.programCalls != 1 || repo.metricsCalls != 1 || repo.videoCalls != 1 {
		t.Errorf("want one call per metric family, got program=%d metrics=%d videos=%d",
			repo.programCalls, repo.metricsCalls, repo.videoCalls)
	}
	if len(repo.lastIDs) != 2 {
		t.Errorf("want both athlete ids passed down, got %v", repo.lastIDs)
	}
}

func TestGetRoster_UsesTrailingWindow(t *testing.T) {
	repo := rosterRepo(oneAthlete())

	if _, err := newRosterService(repo).GetRoster(context.Background(), coachID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := refNow.AddDate(0, 0, -metricsWindowDays)
	if !repo.lastSince.Equal(want) {
		t.Errorf("want since=%v, got %v", want, repo.lastSince)
	}
}

func TestGetRoster_AthleteWithNoDataIsNewNotZeroPercent(t *testing.T) {
	repo := rosterRepo(oneAthlete())

	got, err := newRosterService(repo).GetRoster(context.Background(), coachID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	row := got[0]
	if row.Status != AthleteStatusNew {
		t.Errorf("want status %q, got %q", AthleteStatusNew, row.Status)
	}
	if row.CompliancePct != nil {
		t.Errorf("compliance should be absent, not 0: got %d", *row.CompliancePct)
	}
	if row.ProgramID != nil || row.ProgramName != nil {
		t.Error("an athlete with no program should have no program fields")
	}
	if row.TotalWeeks != 0 || row.CurrentWeek != 0 {
		t.Errorf("want zero weeks, got current=%d total=%d", row.CurrentWeek, row.TotalWeeks)
	}
}

func TestGetRoster_ComposesAllSources(t *testing.T) {
	start := refNow.AddDate(0, 0, -15)
	programID := fixedID("program:1")
	rpe := 8.1
	last := refNow.AddDate(0, 0, -1)

	repo := rosterRepo(oneAthlete())
	repo.latestProgramFn = func(context.Context, []uuid.UUID) (map[uuid.UUID]RosterProgram, error) {
		return map[uuid.UUID]RosterProgram{athleteID: {
			UserID: athleteID, ProgramID: programID,
			ProgramName: "Hypertrophy Block v3", StartDate: &start, WeekCount: 4,
		}}, nil
	}

	repo.schedulesFn = func(context.Context, []uuid.UUID) (map[uuid.UUID][]ScheduledDay, error) {
		var days []ScheduledDay
		for w := int32(1); w <= 4; w++ {
			days = append(days,
				ScheduledDay{ProgramID: programID, WeekSequence: w, DaySequence: 1},
				ScheduledDay{ProgramID: programID, WeekSequence: w, DaySequence: 2},
			)
		}
		return map[uuid.UUID][]ScheduledDay{programID: days}, nil
	}
	repo.metricsFn = func(context.Context, []uuid.UUID, time.Time) (map[uuid.UUID]RosterMetrics, error) {
		return map[uuid.UUID]RosterMetrics{athleteID: {
			UserID: athleteID, CompletedSessions: 5,
			AvgRpe: &rpe, LastSessionAt: &last,
		}}, nil
	}
	repo.videosFn = func(context.Context, []uuid.UUID) (map[uuid.UUID]int64, error) {
		return map[uuid.UUID]int64{athleteID: 3}, nil
	}

	got, err := newRosterService(repo).GetRoster(context.Background(), coachID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	row := got[0]
	if row.ProgramName == nil || *row.ProgramName != "Hypertrophy Block v3" {
		t.Errorf("program name not composed: %+v", row.ProgramName)
	}
	if row.CurrentWeek != 3 || row.TotalWeeks != 4 {
		t.Errorf("want W3/4, got W%d/%d", row.CurrentWeek, row.TotalWeeks)
	}
	if row.SessionsDue != 6 || row.SessionsCompleted != 5 {
		t.Errorf("want 5/6 sessions, got %d/%d", row.SessionsCompleted, row.SessionsDue)
	}
	if row.CompliancePct == nil || *row.CompliancePct != 83 {
		t.Errorf("want 83%% compliance, got %v", row.CompliancePct)
	}
	if row.VideosWaiting != 3 {
		t.Errorf("want 3 videos waiting, got %d", row.VideosWaiting)
	}
	if row.Status != AthleteStatusOnTrack {
		t.Errorf("want %q, got %q", AthleteStatusOnTrack, row.Status)
	}
}

func TestGetRoster_MetricGapsDoNotDropTheAthlete(t *testing.T) {
	repo := rosterRepo(oneAthlete())
	repo.latestProgramFn = func(context.Context, []uuid.UUID) (map[uuid.UUID]RosterProgram, error) {
		return map[uuid.UUID]RosterProgram{}, nil
	}

	got, err := newRosterService(repo).GetRoster(context.Background(), coachID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].DisplayName != "Marcus Webb" {
		t.Errorf("athlete should still appear, got %+v", got)
	}
}

func TestGetRoster_RepoErrorsPropagate(t *testing.T) {
	boom := errors.New("connection refused")

	for _, tc := range []struct {
		name  string
		apply func(*fakeRepository)
	}{
		{"athletes", func(f *fakeRepository) {
			f.listActiveAthletesFn = func(context.Context, uuid.UUID) ([]RosterAthlete, error) { return nil, boom }
		}},
		{"programs", func(f *fakeRepository) {
			f.latestProgramFn = func(context.Context, []uuid.UUID) (map[uuid.UUID]RosterProgram, error) { return nil, boom }
		}},
		{"metrics", func(f *fakeRepository) {
			f.metricsFn = func(context.Context, []uuid.UUID, time.Time) (map[uuid.UUID]RosterMetrics, error) { return nil, boom }
		}},
		{"videos", func(f *fakeRepository) {
			f.videosFn = func(context.Context, []uuid.UUID) (map[uuid.UUID]int64, error) { return nil, boom }
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := rosterRepo(oneAthlete())
			tc.apply(repo)

			_, err := newRosterService(repo).GetRoster(context.Background(), coachID)
			if !errors.Is(err, boom) {
				t.Errorf("want the underlying error wrapped, got %v", err)
			}
		})
	}
}

func ptr[T any](v T) *T { return &v }
