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
	LinkID        uuid.UUID
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

type Link struct {
	LinkID        uuid.UUID
	CoachUserID   uuid.UUID
	AthleteUserID uuid.UUID
	CoachName     string
	AthleteName   string
	Status        string
}

type NoteWithAuthor struct {
	Note       generated.CoachNote
	AuthorName string
}

type Repository interface {
	IsActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error)
	IsLinkParticipant(ctx context.Context, linkID, userID uuid.UUID) (bool, error)
	ListLinksForUser(ctx context.Context, userID uuid.UUID) ([]Link, error)
	GetLink(ctx context.Context, linkID uuid.UUID) (*generated.CoachAthlete, error)

	ListNotes(ctx context.Context, linkID uuid.UUID, limit int) ([]NoteWithAuthor, error)
	CreateNote(ctx context.Context, note *generated.CoachNote) (*NoteWithAuthor, error)
	VideoBelongsTo(ctx context.Context, videoID, userID uuid.UUID) (bool, error)
	ListActiveAthletes(ctx context.Context, coachID uuid.UUID) ([]RosterAthlete, error)
	LatestProgramByUser(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]RosterProgram, error)
	ScheduledDaysByProgram(ctx context.Context, programIDs []uuid.UUID) (map[uuid.UUID][]ScheduledDay, error)
	MetricsByUser(ctx context.Context, userIDs, programIDs []uuid.UUID, since time.Time) (map[uuid.UUID]RosterMetrics, error)
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

func (r *repository) IsLinkParticipant(ctx context.Context, linkID, userID uuid.UUID) (bool, error) {
	ca := r.q.CoachAthlete

	onEitherSide := ca.WithContext(ctx).
		Where(ca.CoachUserID.Eq(userID)).
		Or(ca.AthleteUserID.Eq(userID))

	count, err := ca.WithContext(ctx).
		Where(ca.ID.Eq(linkID), ca.Status.Eq(StatusActive)).
		Where(onEitherSide).
		Count()
	if err != nil {
		return false, fmt.Errorf("look up link membership: %w", err)
	}
	return count > 0, nil
}

func (r *repository) GetLink(ctx context.Context, linkID uuid.UUID) (*generated.CoachAthlete, error) {
	ca := r.q.CoachAthlete
	return ca.WithContext(ctx).Where(ca.ID.Eq(linkID)).First()
}

func (r *repository) ListLinksForUser(ctx context.Context, userID uuid.UUID) ([]Link, error) {
	ca := r.q.CoachAthlete
	coach := r.q.User.As("coach")
	athlete := r.q.User.As("athlete")

	onEitherSide := ca.WithContext(ctx).
		Where(ca.CoachUserID.Eq(userID)).
		Or(ca.AthleteUserID.Eq(userID))

	var rows []Link
	err := ca.WithContext(ctx).
		Select(
			ca.ID.As("link_id"),
			ca.CoachUserID,
			ca.AthleteUserID,
			ca.Status,
			coach.DisplayName.As("coach_name"),
			athlete.DisplayName.As("athlete_name"),
		).
		Join(coach, coach.ID.EqCol(ca.CoachUserID)).
		Join(athlete, athlete.ID.EqCol(ca.AthleteUserID)).
		Where(ca.Status.Eq(StatusActive)).
		Where(onEitherSide).
		Scan(&rows)
	if err != nil {
		return nil, fmt.Errorf("list links: %w", err)
	}
	return rows, nil
}

func (r *repository) ListNotes(ctx context.Context, linkID uuid.UUID, limit int) ([]NoteWithAuthor, error) {
	cn := r.q.CoachNote
	u := r.q.User

	var rows []struct {
		generated.CoachNote
		AuthorName string
	}
	// Fetch the newest `limit` rows (created_at DESC + LIMIT), so a long-lived
	// thread doesn't return its whole history, then reverse into chronological
	// order for the thread view.
	err := cn.WithContext(ctx).
		Select(cn.ALL, u.DisplayName.As("author_name")).
		Join(u, u.ID.EqCol(cn.AuthorUserID)).
		Where(cn.CoachAthleteID.Eq(linkID)).
		Order(cn.CreatedAt.Desc()).
		Limit(limit).
		Scan(&rows)
	if err != nil {
		return nil, fmt.Errorf("list notes: %w", err)
	}

	out := make([]NoteWithAuthor, len(rows))
	for i, row := range rows {
		out[len(rows)-1-i] = NoteWithAuthor{Note: row.CoachNote, AuthorName: row.AuthorName}
	}
	return out, nil
}

func (r *repository) CreateNote(ctx context.Context, note *generated.CoachNote) (*NoteWithAuthor, error) {
	if err := r.q.CoachNote.WithContext(ctx).Create(note); err != nil {
		return nil, fmt.Errorf("create note: %w", err)
	}

	u := r.q.User
	author, err := u.WithContext(ctx).Select(u.DisplayName).Where(u.ID.Eq(note.AuthorUserID)).First()
	if err != nil {
		return nil, fmt.Errorf("load note author: %w", err)
	}

	return &NoteWithAuthor{Note: *note, AuthorName: author.DisplayName}, nil
}

func (r *repository) VideoBelongsTo(ctx context.Context, videoID, userID uuid.UUID) (bool, error) {
	sv := r.q.SetVideo

	count, err := sv.WithContext(ctx).
		Where(sv.ID.Eq(videoID), sv.UserID.Eq(userID)).
		Count()
	if err != nil {
		return false, fmt.Errorf("look up video owner: %w", err)
	}
	return count > 0, nil
}

func (r *repository) ListActiveAthletes(ctx context.Context, coachID uuid.UUID) ([]RosterAthlete, error) {
	ca := r.q.CoachAthlete
	u := r.q.User

	var rows []RosterAthlete
	err := ca.WithContext(ctx).
		Select(ca.ID.As("link_id"), ca.AthleteUserID, u.DisplayName, u.Email).
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

	// One row per athlete — their latest program by start date (nulls last),
	// tie-broken by creation time. DISTINCT ON is Postgres-specific and has no
	// gorm/gen fluent form, so this stays raw; keeping the dedup in SQL is the
	// whole point — the alternative loads an athlete's entire program history
	// into memory on every roster request.
	var rows []struct {
		ID          uuid.UUID
		OwnerUserID uuid.UUID
		Name        string
		StartDate   *time.Time
	}
	err := r.db.WithContext(ctx).Raw(`
		select distinct on (owner_user_id) id, owner_user_id, name, start_date
		  from programs
		 where owner_user_id in ? and deleted_at is null
		 order by owner_user_id, start_date desc nulls last, created_at desc
	`, userIDs).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("load latest athlete programs: %w", err)
	}

	programIDs := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		programIDs = append(programIDs, row.ID)
	}

	weeks, err := r.weekCountsByProgram(ctx, programIDs)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		out[row.OwnerUserID] = RosterProgram{
			UserID:      row.OwnerUserID,
			ProgramID:   row.ID,
			ProgramName: row.Name,
			StartDate:   row.StartDate,
			WeekCount:   weeks[row.ID],
		}
	}

	return out, nil
}

func (r *repository) weekCountsByProgram(ctx context.Context, programIDs []uuid.UUID) (map[uuid.UUID]int32, error) {
	counts := map[uuid.UUID]int32{}
	if len(programIDs) == 0 {
		return counts, nil
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

func (r *repository) MetricsByUser(ctx context.Context, userIDs, programIDs []uuid.UUID, since time.Time) (map[uuid.UUID]RosterMetrics, error) {
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

	// Compliance numerator: completed sessions that belong to the displayed
	// program, not every session in the window. Joining through the program's
	// days excludes ad-hoc sessions and sessions from other programs, so an
	// athlete cannot show 100% on the current program off unrelated workouts.
	// With no programs there is nothing to be compliant to, so the count stays
	// zero rather than the join degenerating to an empty IN.
	if len(programIDs) > 0 {
		pd := r.q.ProgramDay
		pw := r.q.ProgramWeek
		var doneRows []struct {
			UserID uuid.UUID
			Count  int64
		}
		err = ss.WithContext(ctx).
			Select(ss.UserID, ss.ID.Count().As("count")).
			Join(pd, pd.ID.EqCol(ss.ProgramDayID)).
			Join(pw, pw.ID.EqCol(pd.ProgramWeekID)).
			Where(
				ss.UserID.In(ids...),
				ss.State.Eq(sessionStateCompleted),
				ss.StartedAt.Gte(since),
				pw.ProgramID.In(uuidValues(programIDs)...),
			).
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
