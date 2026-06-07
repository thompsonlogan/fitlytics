package sessions

import (
	"cmp"
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"
	"gorm.io/gen/field"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
	"github.com/thompsonlogan/fitlytics/backend/internal/query"
)

type Repository interface {
	GetCurrentSessionByDay(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*generated.Session, error)
	StartSessionForDay(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*generated.Session, error)
	UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*generated.SetLog, error)
	FindCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayRow, error)
}

type CompletedDayRow struct {
	WeekSequence int32
	DaySequence  int32
}

type repository struct {
	db *gorm.DB
	q  *query.Query
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db, q: query.Use(db)}
}

func sortSessionTree(s *generated.Session) {
	slices.SortFunc(s.Exercises, func(a, b generated.SessionExercise) int {
		return cmp.Compare(a.Sequence, b.Sequence)
	})
	for i := range s.Exercises {
		slices.SortFunc(s.Exercises[i].SetLogs, func(a, b generated.SetLog) int {
			return cmp.Compare(a.Sequence, b.Sequence)
		})
	}
}

func (r *repository) GetCurrentSessionByDay(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*generated.Session, error) {
	s := r.q.Session

	session, err := s.WithContext(ctx).
		Preload(s.Exercises).
		Preload(s.Exercises.SetLogs).
		Where(s.UserID.Eq(ownerUserID), s.ProgramDayID.Eq(programDayID)).
		Order(s.CreatedAt.Desc()).
		First()
	if err != nil {
		return nil, err
	}

	sortSessionTree(session)
	return session, nil
}

func (r *repository) StartSessionForDay(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*generated.Session, error) {
	var out generated.Session

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := query.Use(tx)
		s := q.Session

		// 1) Existing session? Reuse it.
		existing, err := s.WithContext(ctx).
			Preload(s.Exercises).
			Preload(s.Exercises.SetLogs).
			Where(s.UserID.Eq(ownerUserID), s.ProgramDayID.Eq(programDayID)).
			Order(s.CreatedAt.Desc()).
			First()
		if err == nil {
			sortSessionTree(existing)
			out = *existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("lookup existing session: %w", err)
		}

		// 2) Verify the program day belongs to a program owned by the caller.
		pr := q.Program
		program, err := pr.WithContext(ctx).
			Where(pr.ID.Eq(programID), pr.OwnerUserID.Eq(ownerUserID)).
			First()
		if err != nil {
			return err
		}

		pd := q.ProgramDay
		pw := q.ProgramWeek
		day, err := pd.WithContext(ctx).
			Join(&generated.ProgramWeek{}, pw.ID.EqCol(pd.WeekID)).
			Where(pd.ID.Eq(programDayID), pw.ProgramID.Eq(programID)).
			First()
		if err != nil {
			return err
		}

		// 3) Pull the program exercises + set targets for the snapshot.
		pe := q.ProgramExercise
		pExercises, err := pe.WithContext(ctx).
			Preload(pe.SetTargets).
			Where(pe.DayID.Eq(programDayID)).
			Order(pe.Sequence).
			Find()
		if err != nil {
			return fmt.Errorf("load program exercises: %w", err)
		}

		// Bulk-fetch exercise names for the name_snap field.
		nameByID := make(map[uuid.UUID]string)
		if len(pExercises) > 0 {
			ids := make([]uuid.UUID, 0, len(pExercises))
			seen := make(map[uuid.UUID]struct{})
			for _, p := range pExercises {
				if _, ok := seen[p.ExerciseID]; ok {
					continue
				}
				seen[p.ExerciseID] = struct{}{}
				ids = append(ids, p.ExerciseID)
			}

			e := q.Exercise
			vals := make([]driver.Valuer, len(ids))
			for i, id := range ids {
				vals[i] = id
			}
			rows, err := e.WithContext(ctx).
				Select(e.ID, e.Name).
				Where(e.ID.In(vals...)).
				Find()
			if err != nil {
				return fmt.Errorf("lookup exercise names: %w", err)
			}
			for _, row := range rows {
				nameByID[row.ID] = row.Name
			}
		}

		// 4) Create the session row.
		now := time.Now()
		session := generated.Session{
			UserID:          ownerUserID,
			ProgramDayID:    &programDayID,
			ProgramNameSnap: &program.Name,
			DayNameSnap:     &day.Name,
			State:     "planned",
			StartedAt: &now,
		}
		if err := s.WithContext(ctx).Create(&session); err != nil {
			return fmt.Errorf("create session: %w", err)
		}

		// 5) Snapshot the prescription into the session: one session_exercise
		// per program_exercise, one set_log per program_set_target. Each level
		// is inserted in a single batch — two INSERTs total rather than one per
		// row. The session_exercises are created first so their generated IDs
		// can be referenced by the set_logs.
		seQ := q.SessionExercise
		slQ := q.SetLog

		sessionExercises := make([]*generated.SessionExercise, len(pExercises))
		for i, p := range pExercises {
			sessionExercises[i] = &generated.SessionExercise{
				SessionID:        session.ID,
				Sequence:         p.Sequence,
				ExerciseID:       p.ExerciseID,
				ExerciseNameSnap: nameByID[p.ExerciseID],
				SubSnap:          p.SubText,
				RestSecondsSnap:  p.RestSeconds,
			}
		}
		if len(sessionExercises) > 0 {
			if err := seQ.WithContext(ctx).Create(sessionExercises...); err != nil {
				return fmt.Errorf("create session exercises: %w", err)
			}
		}

		var setLogs []*generated.SetLog
		for i, p := range pExercises {
			seID := sessionExercises[i].ID
			for _, pst := range p.SetTargets {
				setLogs = append(setLogs, &generated.SetLog{
					SessionExerciseID:      seID,
					Sequence:               pst.Sequence,
					SetType:                pst.SetType,
					RepsTargetMin:          pst.RepsMin,
					RepsTargetMax:          pst.RepsMax,
					PrescribedLoadKg:       pst.PrescribedLoadKg,
					PrescribedLoadModifier: pst.PrescribedLoadModifier,
					PrescribedRpe:          pst.PrescribedRpe,
					IntensityText:          pst.IntensityText,
					ActualLoadModifier:     "absolute",
					State:                  "pending",
				})
			}
		}
		if len(setLogs) > 0 {
			if err := slQ.WithContext(ctx).Create(setLogs...); err != nil {
				return fmt.Errorf("create set logs: %w", err)
			}
		}

		// 6) Reload with full preloads for the response.
		loaded, err := s.WithContext(ctx).
			Preload(s.Exercises).
			Preload(s.Exercises.SetLogs).
			Where(s.ID.Eq(session.ID)).
			First()
		if err != nil {
			return err
		}
		sortSessionTree(loaded)
		out = *loaded
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *repository) UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*generated.SetLog, error) {
	var out *generated.SetLog

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := query.Use(tx)
		sl := q.SetLog
		se := q.SessionExercise
		ss := q.Session

		// Ownership probe: verify the set_log rolls up to a session owned
		// by the caller and matches the path session id.
		setLog, err := sl.WithContext(ctx).Where(sl.ID.Eq(setLogID)).First()
		if err != nil {
			return err
		}

		_, err = se.WithContext(ctx).
			Where(se.ID.Eq(setLog.SessionExerciseID), se.SessionID.Eq(sessionID)).
			First()
		if err != nil {
			return err
		}

		_, err = ss.WithContext(ctx).
			Where(ss.ID.Eq(sessionID), ss.UserID.Eq(ownerUserID)).
			First()
		if err != nil {
			return err
		}

		// Apply field updates.
		var assigns []field.AssignExpr
		if input.RepsActual != nil {
			assigns = append(assigns, sl.RepsActual.Value(*input.RepsActual))
		}
		if input.ActualLoadKg != nil {
			assigns = append(assigns, sl.ActualLoadKg.Value(*input.ActualLoadKg))
		}
		if input.ActualRpe != nil {
			assigns = append(assigns, sl.ActualRpe.Value(*input.ActualRpe))
		}
		if input.State != nil {
			assigns = append(assigns, sl.State.Value(*input.State))
		}
		if len(assigns) == 0 {
			out = setLog
			return nil
		}

		if _, err := sl.WithContext(ctx).Where(sl.ID.Eq(setLogID)).UpdateSimple(assigns...); err != nil {
			return fmt.Errorf("update set log: %w", err)
		}

		// Recompute session state from the current set_log distribution.
		exercises, err := se.WithContext(ctx).
			Select(se.ID).
			Where(se.SessionID.Eq(sessionID)).
			Find()
		if err != nil {
			return fmt.Errorf("find session exercises: %w", err)
		}

		seIDs := make([]driver.Valuer, len(exercises))
		for i, ex := range exercises {
			seIDs[i] = ex.ID
		}

		logs, err := sl.WithContext(ctx).
			Select(sl.State).
			Where(sl.SessionExerciseID.In(seIDs...)).
			Find()
		if err != nil {
			return fmt.Errorf("count session set_logs: %w", err)
		}

		var pending, completed, skipped int
		for _, log := range logs {
			switch log.State {
			case "pending":
				pending++
			case "completed":
				completed++
			case "skipped":
				skipped++
			}
		}
		total := len(logs)

		switch {
		case total == 0:
		case pending == 0:
			now := time.Now()
			if _, err := ss.WithContext(ctx).Where(ss.ID.Eq(sessionID)).
				UpdateSimple(ss.State.Value("completed"), ss.CompletedAt.Value(now)); err != nil {
				return fmt.Errorf("update session state: %w", err)
			}
		case completed > 0 || skipped > 0:
			if _, err := ss.WithContext(ctx).Where(ss.ID.Eq(sessionID)).
				UpdateSimple(ss.State.Value("in_progress"), ss.CompletedAt.Null()); err != nil {
				return fmt.Errorf("update session state: %w", err)
			}
		default:
			if _, err := ss.WithContext(ctx).Where(ss.ID.Eq(sessionID)).
				UpdateSimple(ss.State.Value("planned"), ss.CompletedAt.Null()); err != nil {
				return fmt.Errorf("update session state: %w", err)
			}
		}

		out, err = sl.WithContext(ctx).Where(sl.ID.Eq(setLogID)).First()
		return err
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (r *repository) FindCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayRow, error) {
	s := r.q.Session
	pd := r.q.ProgramDay
	pw := r.q.ProgramWeek

	var rows []CompletedDayRow
	err := s.WithContext(ctx).
		Select(pw.Sequence.As("week_sequence"), pd.Sequence.As("day_sequence")).
		Join(&generated.ProgramDay{}, pd.ID.EqCol(s.ProgramDayID)).
		Join(&generated.ProgramWeek{}, pw.ID.EqCol(pd.WeekID)).
		Where(s.UserID.Eq(ownerUserID), s.State.Eq("completed"), pw.ProgramID.Eq(programID)).
		Group(pw.Sequence, pd.Sequence).
		Order(pw.Sequence, pd.Sequence).
		Scan(&rows)
	if err != nil {
		return nil, fmt.Errorf("find completed days: %w", err)
	}
	if rows == nil {
		rows = []CompletedDayRow{}
	}
	return rows, nil
}
