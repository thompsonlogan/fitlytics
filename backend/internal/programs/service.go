package programs

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ErrNotFound is returned when the requested program does not exist OR is
// owned by a different user. We deliberately collapse both into one error so
// callers can't probe id existence across user boundaries — the handler maps
// this to a 404.
var ErrNotFound = errors.New("program not found")

// Service is the application layer for the program feature. It orchestrates
// repository calls and converts loaded aggregates into response DTOs (the
// model→DTO mapping itself lives in mapper.go).
type Service interface {
	// GetFullTree returns the program tree owned by ownerUserID. Returns
	// ErrNotFound if the program is missing or owned by someone else.
	GetFullTree(ctx context.Context, programID, ownerUserID uuid.UUID) (*ProgramResponse, error)
}

type service struct {
	repo Repository
}

// NewService wires a Service to its dependencies.
func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) GetFullTree(ctx context.Context, programID, ownerUserID uuid.UUID) (*ProgramResponse, error) {
	program, err := s.repo.GetFullTree(ctx, programID, ownerUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("load program: %w", err)
	}

	// Bulk-fetch exercise names in one query so the per-exercise mapping in
	// mapProgram doesn't issue N round-trips.
	exerciseIDs := collectExerciseIDs(program)
	names, err := s.repo.LookupExerciseNames(ctx, exerciseIDs)
	if err != nil {
		return nil, fmt.Errorf("load exercise names: %w", err)
	}

	return mapProgram(program, names), nil
}
