package sessions

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models"
)

// Repository is the data-access boundary for the session aggregate. Like the
// programs repo, the service layer talks to this interface and tests can
// swap a fake without booting GORM.
type Repository interface {
	// FindCurrentByDay returns the most recent active (non-deleted) session
	// for (user, program_day). Returns gorm.ErrRecordNotFound when none
	// exists. Active here means deleted_at IS NULL; state can be any of
	// planned/in_progress/completed — the FE displays them all the same.
	FindCurrentByDay(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*models.Session, error)

	// EnsureForDay finds or creates a session for the given program day.
	// When creating, it snapshots the day's program tree into
	// session_exercises and set_logs (one log per program_set_target).
	// Returns the loaded aggregate either way. Verifies the program day
	// belongs to a program owned by ownerUserID; otherwise
	// gorm.ErrRecordNotFound.
	EnsureForDay(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*models.Session, error)

	// UpdateSetLog applies the supplied column updates to one set_logs row,
	// scoped to a session owned by ownerUserID. After applying, it recomputes
	// the parent session's state (pending → in_progress → completed) so the
	// day-completions endpoint can read sessions.state directly without
	// re-walking the set_logs every call. gorm.ErrRecordNotFound if the log
	// doesn't roll up to the caller's session.
	UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, updates map[string]any) (*models.SetLog, error)

	// FindCompletedDays returns the (week_sequence, day_sequence) pairs for
	// every session in this program (owned by ownerUserID) that has rolled to
	// state='completed'. Used by the day selector to render the "done" dot.
	FindCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayRow, error)
}

// CompletedDayRow is the flat shape returned by FindCompletedDays — bare
// (week, day) sequence numbers so the API layer can hand them back without
// loading the full program tree.
type CompletedDayRow struct {
	WeekSequence int32 `gorm:"column:week_sequence"`
	DaySequence  int32 `gorm:"column:day_sequence"`
}

type repository struct {
	db *gorm.DB
}

// NewRepository wires the sessions repository to a live *gorm.DB.
func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db}
}

// preloadSessionTree applies the standard child preload chain used by every
// session read. Set log ordering is by sequence ASC so the FE doesn't have to
// re-sort the table.
func preloadSessionTree(db *gorm.DB) *gorm.DB {
	return db.
		Preload("Exercises", func(db *gorm.DB) *gorm.DB { return db.Order("sequence ASC") }).
		Preload("Exercises.SetLogs", func(db *gorm.DB) *gorm.DB {
			return db.Where("deleted_at IS NULL").Order("sequence ASC")
		})
}

func (r *repository) FindCurrentByDay(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*models.Session, error) {
	var s models.Session
	err := preloadSessionTree(r.db.WithContext(ctx)).
		Where("user_id = ? AND program_day_id = ?", ownerUserID, programDayID).
		Order("created_at DESC").
		First(&s).Error
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *repository) EnsureForDay(
	ctx context.Context,
	programID, programDayID, ownerUserID uuid.UUID,
) (*models.Session, error) {
	var out models.Session

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 1) Existing session? Reuse it. This is the "idempotent" arm — if
		// the user already started this day, hand the same session back
		// rather than littering the DB with duplicates.
		var existing models.Session
		err := preloadSessionTree(tx).
			Where("user_id = ? AND program_day_id = ?", ownerUserID, programDayID).
			Order("created_at DESC").
			First(&existing).Error
		if err == nil {
			out = existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("lookup existing session: %w", err)
		}

		// 2) Need to create. First verify the program day belongs to a
		// program owned by the caller AND the program id in the URL matches.
		// Same ownership-via-join pattern used in programs.
		var dayProbe struct {
			ID              uuid.UUID
			Name            string
			ProgramName     string
			ProgramID       uuid.UUID
			Sequence        int32
			ProgramSequence int32
		}
		err = tx.Table(models.TableNameProgramDay).
			Select("program_days.id AS id, program_days.name AS name, programs.name AS program_name, programs.id AS program_id, program_days.sequence AS sequence, program_weeks.sequence AS program_sequence").
			Joins("JOIN program_weeks ON program_weeks.id = program_days.week_id").
			Joins("JOIN programs ON programs.id = program_weeks.program_id").
			Where("program_days.id = ? AND programs.id = ? AND programs.owner_user_id = ? AND programs.deleted_at IS NULL",
				programDayID, programID, ownerUserID).
			Take(&dayProbe).Error
		if err != nil {
			return err
		}

		// 3) Pull the program exercises + set targets for the snapshot.
		var pExercises []models.ProgramExercise
		if err := tx.
			Preload("SetTargets", func(db *gorm.DB) *gorm.DB { return db.Order("sequence ASC") }).
			Where("day_id = ?", programDayID).
			Order("sequence ASC").
			Find(&pExercises).Error; err != nil {
			return fmt.Errorf("load program exercises: %w", err)
		}

		// Bulk-fetch exercise names for the name_snap field. Same trick the
		// programs service uses.
		nameByID := make(map[uuid.UUID]string)
		if len(pExercises) > 0 {
			ids := make([]uuid.UUID, 0, len(pExercises))
			seen := make(map[uuid.UUID]struct{})
			for _, pe := range pExercises {
				if _, ok := seen[pe.ExerciseID]; ok {
					continue
				}
				seen[pe.ExerciseID] = struct{}{}
				ids = append(ids, pe.ExerciseID)
			}
			type row struct {
				ID   uuid.UUID
				Name string
			}
			var rows []row
			if err := tx.Table(models.TableNameExercise).
				Select("id, name").
				Where("id IN ?", ids).
				Find(&rows).Error; err != nil {
				return fmt.Errorf("lookup exercise names: %w", err)
			}
			for _, r := range rows {
				nameByID[r.ID] = r.Name
			}
		}

		// 4) Create the session row.
		now := time.Now()
		programName := dayProbe.ProgramName
		dayName := dayProbe.Name
		session := models.Session{
			UserID:          ownerUserID,
			ProgramDayID:    &programDayID,
			ProgramNameSnap: &programName,
			DayNameSnap:     &dayName,
			State:           "in_progress",
			StartedAt:       &now,
		}
		if err := tx.Create(&session).Error; err != nil {
			return fmt.Errorf("create session: %w", err)
		}

		// 5) For each program_exercise, create a session_exercise + one
		// set_log per program_set_target. "One log per block" per design.
		for _, pe := range pExercises {
			se := models.SessionExercise{
				SessionID:        session.ID,
				Sequence:         pe.Sequence,
				ExerciseID:       pe.ExerciseID,
				ExerciseNameSnap: nameByID[pe.ExerciseID],
				SubSnap:          pe.SubText,
				RestSecondsSnap:  pe.RestSeconds,
			}
			if err := tx.Create(&se).Error; err != nil {
				return fmt.Errorf("create session exercise: %w", err)
			}

			for _, pst := range pe.SetTargets {
				log := models.SetLog{
					SessionExerciseID:      se.ID,
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
				}
				if err := tx.Create(&log).Error; err != nil {
					return fmt.Errorf("create set log: %w", err)
				}
			}
		}

		// 6) Reload with full preloads for the response.
		return preloadSessionTree(tx).
			Where("id = ?", session.ID).
			First(&out).Error
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *repository) UpdateSetLog(
	ctx context.Context,
	sessionID, setLogID, ownerUserID uuid.UUID,
	updates map[string]any,
) (*models.SetLog, error) {
	var out models.SetLog

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Ownership probe: the set_log must belong to a session_exercise of a
		// session owned by the caller, AND the path session id must match.
		// The same join pattern guards against id-swapping.
		var probe struct{ ID uuid.UUID }
		err := tx.Table(models.TableNameSetLog).
			Select("set_logs.id").
			Joins("JOIN session_exercises ON session_exercises.id = set_logs.session_exercise_id").
			Joins("JOIN sessions ON sessions.id = session_exercises.session_id").
			Where("set_logs.id = ? AND sessions.id = ? AND sessions.user_id = ? AND sessions.deleted_at IS NULL AND set_logs.deleted_at IS NULL",
				setLogID, sessionID, ownerUserID).
			Take(&probe).Error
		if err != nil {
			return err
		}

		if len(updates) > 0 {
			if err := tx.Model(&models.SetLog{}).
				Where("id = ?", setLogID).
				Updates(updates).Error; err != nil {
				return fmt.Errorf("update set log: %w", err)
			}
		}

		// Recompute session state from the current set_log distribution. This
		// keeps sessions.state in lockstep with the per-set states so the day
		// selector can read it directly. Counts only live (non-deleted) logs.
		var counts struct {
			Total     int64
			Pending   int64
			Completed int64
			Skipped   int64
		}
		if err := tx.Table(models.TableNameSetLog).
			Select(`COUNT(*) AS total,
				COUNT(*) FILTER (WHERE state = 'pending') AS pending,
				COUNT(*) FILTER (WHERE state = 'completed') AS completed,
				COUNT(*) FILTER (WHERE state = 'skipped') AS skipped`).
			Joins("JOIN session_exercises ON session_exercises.id = set_logs.session_exercise_id").
			Where("session_exercises.session_id = ? AND set_logs.deleted_at IS NULL", sessionID).
			Scan(&counts).Error; err != nil {
			return fmt.Errorf("count session set_logs: %w", err)
		}

		sessionUpdates := map[string]any{}
		switch {
		case counts.Total == 0:
			// Defensive: a session with no set_logs shouldn't auto-complete.
		case counts.Pending == 0:
			now := time.Now()
			sessionUpdates["state"] = "completed"
			sessionUpdates["completed_at"] = &now
		case counts.Completed > 0 || counts.Skipped > 0:
			sessionUpdates["state"] = "in_progress"
			sessionUpdates["completed_at"] = nil
		default:
			sessionUpdates["state"] = "planned"
			sessionUpdates["completed_at"] = nil
		}
		if len(sessionUpdates) > 0 {
			if err := tx.Model(&models.Session{}).
				Where("id = ?", sessionID).
				Updates(sessionUpdates).Error; err != nil {
				return fmt.Errorf("update session state: %w", err)
			}
		}

		return tx.Where("id = ?", setLogID).First(&out).Error
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *repository) FindCompletedDays(
	ctx context.Context,
	programID, ownerUserID uuid.UUID,
) ([]CompletedDayRow, error) {
	var rows []CompletedDayRow
	err := r.db.WithContext(ctx).
		Table(models.TableNameSession).
		Select("program_weeks.sequence AS week_sequence, program_days.sequence AS day_sequence").
		Joins("JOIN program_days ON program_days.id = sessions.program_day_id").
		Joins("JOIN program_weeks ON program_weeks.id = program_days.week_id").
		Joins("JOIN programs ON programs.id = program_weeks.program_id").
		Where(`sessions.user_id = ?
			AND programs.id = ?
			AND programs.owner_user_id = ?
			AND sessions.state = 'completed'
			AND sessions.deleted_at IS NULL
			AND programs.deleted_at IS NULL`, ownerUserID, programID, ownerUserID).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}
