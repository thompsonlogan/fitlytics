package programs

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
)

type Service interface {
	GetProgramById(ctx context.Context, programID, ownerUserID uuid.UUID) (*ProgramResponse, error)
	GetProgramsByUserId(ctx context.Context, ownerUserID uuid.UUID) ([]ProgramSummaryResponse, error)
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) GetProgramById(ctx context.Context, programID, ownerUserID uuid.UUID) (*ProgramResponse, error) {
	program, err := s.repo.GetProgramById(ctx, programID, ownerUserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apierr.ErrNotFound
		}
		return nil, fmt.Errorf("load program: %w", err)
	}

	exerciseIDs := collectExerciseIDs(program)
	names, err := s.repo.GetExercisesByIds(ctx, exerciseIDs)
	if err != nil {
		return nil, fmt.Errorf("load exercise names: %w", err)
	}

	return mapProgram(program, names), nil
}

func (s *service) GetProgramsByUserId(ctx context.Context, ownerUserID uuid.UUID) ([]ProgramSummaryResponse, error) {
	rows, err := s.repo.GetProgramsByUserId(ctx, ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("list programs: %w", err)
	}
	return mapProgramSummaries(rows), nil
}
