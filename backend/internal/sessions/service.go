package sessions

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("session not found")

var ErrInvalidInput = errors.New("invalid input")

type Service interface {
	GetCurrentSession(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	StartSession(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error)
	GetCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error)
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

const (
	minLoadKg = 0.0
	maxLoadKg = 1500.0
	minRpe    = 0.0
	maxRpe    = 10.0
	minReps   = 0
	maxReps   = 1000
)

func (s *service) GetCurrentSession(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	row, err := s.repo.GetCurrentSessionByDay(ctx, programDayID, ownerUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("find current session: %w", err)
	}
	return mapSession(row), nil
}

func (s *service) StartSession(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	row, err := s.repo.StartSessionForDay(ctx, programID, programDayID, ownerUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("ensure session: %w", err)
	}
	return mapSession(row), nil
}

func (s *service) UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error) {
	if input.RepsActual != nil {
		if *input.RepsActual < minReps || *input.RepsActual > maxReps {
			return nil, fmt.Errorf("%w: reps_actual out of range", ErrInvalidInput)
		}
	}
	if input.ActualLoadKg != nil {
		if *input.ActualLoadKg < minLoadKg || *input.ActualLoadKg > maxLoadKg {
			return nil, fmt.Errorf("%w: actual_load_kg out of range", ErrInvalidInput)
		}
	}
	if input.ActualRpe != nil {
		if *input.ActualRpe < minRpe || *input.ActualRpe > maxRpe {
			return nil, fmt.Errorf("%w: actual_rpe out of range", ErrInvalidInput)
		}
	}
	if input.State != nil {
		switch *input.State {
		case "pending", "completed", "skipped":
		default:
			return nil, fmt.Errorf("%w: state must be one of pending, completed, skipped", ErrInvalidInput)
		}
	}

	row, err := s.repo.UpdateSetLog(ctx, sessionID, setLogID, ownerUserID, input)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update set log: %w", err)
	}

	resp := mapSetLog(*row)
	return &resp, nil
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
