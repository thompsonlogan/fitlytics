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

// RequireRead authorizes a read of ownerID's resources by callerID. The owner
// always passes. A different caller may read only as a coach: they must both
// carry the Coach role on their token (callerIsCoach) AND hold an active link
// to the owner. Checking the link alone is not enough — the guarded routes live
// under /api with RequireAuth, not RequireRole, so without the role gate any
// authenticated user placed in coach_user_id could read another user's data.
func (c *Checker) RequireRead(ctx context.Context, callerID, ownerID uuid.UUID, callerIsCoach bool) error {
	if callerID == ownerID {
		return nil
	}
	if !callerIsCoach {
		return apierr.ErrNotFound
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

// RequireCoach authorizes a coach-only action on ownerID's resources (e.g.
// marking a video reviewed). The caller must carry the Coach role and hold an
// active link; unlike RequireRead there is no owner shortcut, because these are
// actions only a coach takes.
func (c *Checker) RequireCoach(ctx context.Context, callerID, ownerID uuid.UUID, callerIsCoach bool) error {
	if !callerIsCoach {
		return apierr.ErrNotFound
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
