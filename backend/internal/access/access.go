package access

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
)

type CoachChecker interface {
	IsActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error)
}

type Checker struct {
	coaches CoachChecker
}

func NewChecker(coaches CoachChecker) *Checker {
	return &Checker{coaches: coaches}
}

func (c *Checker) RequireRead(ctx context.Context, callerID, ownerID uuid.UUID) error {
	if callerID == ownerID {
		return nil
	}

	ok, err := c.coaches.IsActiveCoach(ctx, callerID, ownerID)
	if err != nil {
		return fmt.Errorf("check coaching link: %w", err)
	}
	if !ok {
		return apierr.ErrNotFound
	}
	return nil
}

func (c *Checker) RequireWrite(callerID, ownerID uuid.UUID) error {
	if callerID != ownerID {
		return apierr.ErrNotFound
	}
	return nil
}
