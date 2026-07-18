package coaching

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
)

type Service interface {
	RequireActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) error
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) RequireActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) error {
	ok, err := s.repo.IsActiveCoach(ctx, coachID, athleteID)
	if err != nil {
		return fmt.Errorf("check coaching link: %w", err)
	}
	if !ok {
		return apierr.ErrNotFound
	}
	return nil
}
