package sessions

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
)

type Service interface {
	GetCurrentSession(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	StartSession(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error)
	UpdateSetLogs(ctx context.Context, sessionID, ownerUserID uuid.UUID, input BatchUpdateSetLogsRequest) ([]SetLogResponse, error)
	GetCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error)
	UpdateSession(ctx context.Context, sessionID, ownerUserID uuid.UUID, input UpdateSessionRequest) (*SessionResponse, error)
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

const (
	minLoadKg           = 0.0
	maxLoadKg           = 1500.0
	minRpe              = 0.0
	maxRpe              = 10.0
	minReps             = 0
	maxReps             = 1000
	maxSessionNoteChars = 4000
)

func (s *service) GetCurrentSession(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	row, err := s.repo.GetCurrentSessionByDay(ctx, programID, programDayID, ownerUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierr.ErrNotFound
		}
		return nil, fmt.Errorf("find current session: %w", err)
	}
	return mapSession(row), nil
}

func (s *service) StartSession(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	row, err := s.repo.StartSessionForDay(ctx, programID, programDayID, ownerUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierr.ErrNotFound
		}
		return nil, fmt.Errorf("ensure session: %w", err)
	}
	return mapSession(row), nil
}

func validateSetLogUpdate(input UpdateSetLogRequest) error {
	if input.RepsActual != nil {
		if *input.RepsActual < minReps || *input.RepsActual > maxReps {
			return fmt.Errorf("%w: reps_actual out of range", apierr.ErrInvalidInput)
		}
	}
	if input.ActualLoadKg != nil {
		if *input.ActualLoadKg < minLoadKg || *input.ActualLoadKg > maxLoadKg {
			return fmt.Errorf("%w: actual_load_kg out of range", apierr.ErrInvalidInput)
		}
	}
	if input.ActualRpe != nil {
		if *input.ActualRpe < minRpe || *input.ActualRpe > maxRpe {
			return fmt.Errorf("%w: actual_rpe out of range", apierr.ErrInvalidInput)
		}
	}
	if input.State != nil {
		switch *input.State {
		case "pending", "completed", "skipped":
		default:
			return fmt.Errorf("%w: state must be one of pending, completed, skipped", apierr.ErrInvalidInput)
		}
	}
	return nil
}

func (s *service) UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error) {
	if err := validateSetLogUpdate(input); err != nil {
		return nil, err
	}

	row, err := s.repo.UpdateSetLog(ctx, sessionID, setLogID, ownerUserID, input)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierr.ErrNotFound
		}
		return nil, fmt.Errorf("update set log: %w", err)
	}

	resp := mapSetLog(*row)
	return &resp, nil
}

func (s *service) UpdateSetLogs(ctx context.Context, sessionID, ownerUserID uuid.UUID, input BatchUpdateSetLogsRequest) ([]SetLogResponse, error) {
	// Validate all items first — fail fast before any DB work.
	for _, item := range input.Updates {
		if err := validateSetLogUpdate(item.UpdateSetLogRequest); err != nil {
			return nil, err
		}
	}

	rows, err := s.repo.UpdateSetLogs(ctx, sessionID, ownerUserID, input.Updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierr.ErrNotFound
		}
		return nil, fmt.Errorf("batch update set logs: %w", err)
	}

	out := make([]SetLogResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapSetLog(*row))
	}
	return out, nil
}

func (s *service) UpdateSession(ctx context.Context, sessionID, ownerUserID uuid.UUID, input UpdateSessionRequest) (*SessionResponse, error) {
	if input.Notes != nil && len([]rune(*input.Notes)) > maxSessionNoteChars {
		return nil, fmt.Errorf("%w: notes exceeds %d characters", apierr.ErrInvalidInput, maxSessionNoteChars)
	}

	row, err := s.repo.UpdateSessionNotes(ctx, sessionID, ownerUserID, input.Notes)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierr.ErrNotFound
		}
		return nil, fmt.Errorf("update session: %w", err)
	}
	return mapSession(row), nil
}

func (s *service) GetCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error) {
	rows, err := s.repo.FindCompletedDays(ctx, programID, ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("list completed days: %w", err)
	}
	out := make([]CompletedDayResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, CompletedDayResponse{
			WeekSequence: r.WeekSequence,
			DaySequence:  r.DaySequence,
		})
	}
	return out, nil
}
