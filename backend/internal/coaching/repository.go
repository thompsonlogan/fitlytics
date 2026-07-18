package coaching

import (
	"context"
	"database/sql/driver"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
	"github.com/thompsonlogan/fitlytics/backend/internal/query"
)

type RosterAthlete struct {
	AthleteUserID uuid.UUID
	DisplayName   string
	Email         *string
}

type RosterProgram struct {
	UserID      uuid.UUID
	ProgramID   uuid.UUID
	ProgramName string
	StartDate   *time.Time
	WeekCount   int32
}

type RosterMetrics struct {
	UserID            uuid.UUID
	CompletedSessions int64
	AvgRpe            *float64
	LastSessionAt     *time.Time
}

type ScheduledDay struct {
	ProgramID    uuid.UUID
	WeekSequence int32
	DaySequence  int32
	IsRestDay    bool
}

type Repository interface {
	IsActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error)
	ListActiveAthletes(ctx context.Context, coachID uuid.UUID) ([]RosterAthlete, error)
	LatestProgramByUser(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]RosterProgram, error)
	ScheduledDaysByProgram(ctx context.Context, programIDs []uuid.UUID) (map[uuid.UUID][]ScheduledDay, error)
	MetricsByUser(ctx context.Context, userIDs []uuid.UUID, since time.Time) (map[uuid.UUID]RosterMetrics, error)
	UnreviewedVideoCountByUser(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]int64, error)
}

type repository struct {
	db *gorm.DB
	q  *query.Query
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db, q: query.Use(db)}
}

func (r *repository) IsActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error) {
	ca := r.q.CoachAthlete

	count, err := ca.WithContext(ctx).
		Where(
			ca.CoachUserID.Eq(coachID),
			ca.AthleteUserID.Eq(athleteID),
			ca.Status.Eq(StatusActive),
		).
		Count()
	if err != nil {
		return false, fmt.Errorf("look up coaching link: %w", err)
	}

	return count > 0, nil
}

func (r *repository) ListActiveAthletes(ctx context.Context, coachID uuid.UUID) ([]RosterAthlete, error) {
	ca := r.q.CoachAthlete
	u := r.q.User

	var rows []RosterAthlete
	err := ca.WithContext(ctx).
		Select(ca.AthleteUserID, u.DisplayName, u.Email).
		Join(u, u.ID.EqCol(ca.AthleteUserID)).
		Where(ca.CoachUserID.Eq(coachID), ca.Status.Eq(StatusActive)).
		Order(u.DisplayName).
		Scan(&rows)
	if err != nil {
		return nil, fmt.Errorf("list coached athletes: %w", err)
	}

	return rows, nil
}

func (r *repository) LatestProgramByUser(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]RosterProgram, error) {
	out := map[uuid.UUID]RosterProgram{}
	if len(userIDs) == 0 {
		return out, nil
	}

	p := r.q.Program

	rows, err := p.WithContext(ctx).
		Where(p.OwnerUserID.In(uuidValues(userIDs)...)).
		Find()
	if err != nil {
		return nil, fmt.Errorf("load athlete programs: %w", err)
	}

	latest := map[uuid.UUID]*generated.Program{}
	for _, row := range rows {
		if best, seen := latest[row.OwnerUserID]; !seen || isMoreRecent(row, best) {
			latest[row.OwnerUserID] = row
		}
	}

	weeks, err := r.weekCountsByProgram(ctx, latest)
	if err != nil {
		return nil, err
	}

	for userID, program := range latest {
		out[userID] = RosterProgram{
			UserID:      userID,
			ProgramID:   program.ID,
			ProgramName: program.Name,
			StartDate:   program.StartDate,
			WeekCount:   weeks[program.ID],
		}
	}

	return out, nil
}

func (r *repository) weekCountsByProgram(ctx context.Context, programs map[uuid.UUID]*generated.Program) (map[uuid.UUID]int32, error) {
	counts := map[uuid.UUID]int32{}
	if len(programs) == 0 {
		return counts, nil
	}

	programIDs := make([]uuid.UUID, 0, len(programs))
	for _, p := range programs {
		programIDs = append(programIDs, p.ID)
	}

	pw := r.q.ProgramWeek

	var rows []struct {
		ProgramID uuid.UUID
		Count     int32
	}
	err := pw.WithContext(ctx).
		Select(pw.ProgramID, pw.ID.Count().As("count")).
		Where(pw.ProgramID.In(uuidValues(programIDs)...)).
		Group(pw.ProgramID).
		Scan(&rows)
	if err != nil {
		return nil, fmt.Errorf("count program weeks: %w", err)
	}

	for _, row := range rows {
		counts[row.ProgramID] = row.Count
	}
	return counts, nil
}

func isMoreRecent(a, b *generated.Program) bool {
	switch {
	case a.StartDate != nil && b.StartDate == nil:
		return true
	case a.StartDate == nil && b.StartDate != nil:
		return false
	case a.StartDate != nil && b.StartDate != nil && !a.StartDate.Equal(*b.StartDate):
		return a.StartDate.After(*b.StartDate)
	default:
		return a.CreatedAt.After(b.CreatedAt)
	}
}

func (r *repository) ScheduledDaysByProgram(ctx context.Context, programIDs []uuid.UUID) (map[uuid.UUID][]ScheduledDay, error) {
	out := map[uuid.UUID][]ScheduledDay{}
	if len(programIDs) == 0 {
		return out, nil
	}

	pw := r.q.ProgramWeek
	pd := r.q.ProgramDay

	var rows []ScheduledDay
	err := pd.WithContext(ctx).
		Select(
			pw.ProgramID,
			pw.Sequence.As("week_sequence"),
			pd.Sequence.As("day_sequence"),
			pd.IsRestDay,
		).
		Join(pw, pw.ID.EqCol(pd.ProgramWeekID)).
		Where(pw.ProgramID.In(uuidValues(programIDs)...)).
		Scan(&rows)
	if err != nil {
		return nil, fmt.Errorf("load program schedule: %w", err)
	}

	for _, row := range rows {
		out[row.ProgramID] = append(out[row.ProgramID], row)
	}
	return out, nil
}

func (r *repository) MetricsByUser(ctx context.Context, userIDs []uuid.UUID, since time.Time) (map[uuid.UUID]RosterMetrics, error) {
	out := map[uuid.UUID]RosterMetrics{}
	if len(userIDs) == 0 {
		return out, nil
	}

	ids := uuidValues(userIDs)

	ss := r.q.Session
	var lastRows []struct {
		UserID        uuid.UUID
		LastSessionAt *time.Time
	}
	err := ss.WithContext(ctx).
		Select(ss.UserID, ss.StartedAt.Max().As("last_session_at")).
		Where(ss.UserID.In(ids...)).
		Group(ss.UserID).
		Scan(&lastRows)
	if err != nil {
		return nil, fmt.Errorf("load last sessions: %w", err)
	}

	for _, row := range lastRows {
		out[row.UserID] = RosterMetrics{UserID: row.UserID, LastSessionAt: row.LastSessionAt}
	}

	var doneRows []struct {
		UserID uuid.UUID
		Count  int64
	}
	err = ss.WithContext(ctx).
		Select(ss.UserID, ss.ID.Count().As("count")).
		Where(ss.UserID.In(ids...), ss.State.Eq(sessionStateCompleted), ss.StartedAt.Gte(since)).
		Group(ss.UserID).
		Scan(&doneRows)
	if err != nil {
		return nil, fmt.Errorf("count completed sessions: %w", err)
	}

	for _, row := range doneRows {
		m := out[row.UserID]
		m.UserID = row.UserID
		m.CompletedSessions = row.Count
		out[row.UserID] = m
	}

	sl := r.q.SetLog
	se := r.q.SessionExercise
	var rpeRows []struct {
		UserID uuid.UUID
		AvgRpe *float64
	}
	err = sl.WithContext(ctx).
		Select(sl.UserID, sl.ActualRpe.Avg().As("avg_rpe")).
		Join(se, se.ID.EqCol(sl.SessionExerciseID)).
		Join(ss, ss.ID.EqCol(se.SessionID)).
		Where(
			sl.UserID.In(ids...),
			sl.State.Eq(setLogStateCompleted),
			ss.StartedAt.Gte(since),
		).
		Group(sl.UserID).
		Scan(&rpeRows)
	if err != nil {
		return nil, fmt.Errorf("load athlete rpe: %w", err)
	}

	for _, row := range rpeRows {
		m := out[row.UserID]
		m.UserID = row.UserID
		m.AvgRpe = row.AvgRpe
		out[row.UserID] = m
	}

	return out, nil
}

func (r *repository) UnreviewedVideoCountByUser(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]int64, error) {
	out := map[uuid.UUID]int64{}
	if len(userIDs) == 0 {
		return out, nil
	}

	sv := r.q.SetVideo

	var rows []struct {
		UserID uuid.UUID
		Count  int64
	}
	err := sv.WithContext(ctx).
		Select(sv.UserID, sv.ID.Count().As("count")).
		Where(sv.UserID.In(uuidValues(userIDs)...), sv.Status.Eq(videoStatusReady), sv.ReviewedAt.IsNull()).
		Group(sv.UserID).
		Scan(&rows)
	if err != nil {
		return nil, fmt.Errorf("count unreviewed videos: %w", err)
	}

	for _, row := range rows {
		out[row.UserID] = row.Count
	}
	return out, nil
}

func uuidValues(ids []uuid.UUID) []driver.Valuer {
	vals := make([]driver.Valuer, len(ids))
	for i, id := range ids {
		vals[i] = id
	}
	return vals
}
