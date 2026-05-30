package sessions

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ErrNotFound is returned when the requested session or set log does not
// exist OR is not owned by the caller. We collapse both cases so attackers
// can't probe id existence — handler maps to 404.
var ErrNotFound = errors.New("session not found")

// ErrInvalidInput is returned for domain-bound violations the type system
// can't catch (e.g. RPE out of range). Handler maps to 400.
var ErrInvalidInput = errors.New("invalid input")

// Service is the application layer for the sessions feature.
type Service interface {
	// FindCurrent returns the active session for (caller, programDay) if
	// one exists. ErrNotFound when there's no session yet.
	FindCurrent(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)

	// EnsureForDay finds or creates a session for the given day. Idempotent:
	// repeated calls return the same session. ErrNotFound when the day is
	// not reachable through a program the caller owns.
	EnsureForDay(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)

	// UpdateSetLog writes actuals (load, RPE, completion) to one set_log
	// inside a session owned by the caller.
	UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error)
}

type service struct {
	repo Repository
}

// NewService wires a Service to its dependencies.
func NewService(repo Repository) Service {
	return &service{repo: repo}
}

// Sanity bounds for set actuals — same kg ceiling and RPE scale as the
// programs validator. Keeps typos out of the actuals stream without
// constraining the column types.
const (
	minLoadKg = 0.0
	maxLoadKg = 1500.0
	minRpe    = 0.0
	maxRpe    = 10.0
)

func (s *service) FindCurrent(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	row, err := s.repo.FindCurrentByDay(ctx, programDayID, ownerUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("find current session: %w", err)
	}
	return mapSession(row), nil
}

func (s *service) EnsureForDay(
	ctx context.Context,
	programID, programDayID, ownerUserID uuid.UUID,
) (*SessionResponse, error) {
	row, err := s.repo.EnsureForDay(ctx, programID, programDayID, ownerUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("ensure session: %w", err)
	}
	return mapSession(row), nil
}

func (s *service) UpdateSetLog(
	ctx context.Context,
	sessionID, setLogID, ownerUserID uuid.UUID,
	input UpdateSetLogRequest,
) (*SetLogResponse, error) {
	updates := make(map[string]any, 3)

	if input.ActualLoadKg != nil {
		v := *input.ActualLoadKg
		if v < minLoadKg || v > maxLoadKg {
			return nil, fmt.Errorf("%w: actual_load_kg out of range", ErrInvalidInput)
		}
		updates["actual_load_kg"] = v
	}
	if input.ActualRpe != nil {
		v := *input.ActualRpe
		if v < minRpe || v > maxRpe {
			return nil, fmt.Errorf("%w: actual_rpe out of range", ErrInvalidInput)
		}
		updates["actual_rpe"] = v
	}
	if input.WasCompleted != nil {
		updates["was_completed"] = *input.WasCompleted
	}

	row, err := s.repo.UpdateSetLog(ctx, sessionID, setLogID, ownerUserID, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update set log: %w", err)
	}

	resp := mapSetLog(*row)
	return &resp, nil
}
