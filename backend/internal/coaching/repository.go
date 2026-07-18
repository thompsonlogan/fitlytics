package coaching

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/query"
)

type Repository interface {
	IsActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error)
}

type repository struct {
	db *gorm.DB
	q  *query.Query
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db, q: query.Use(db)}
}

func (r *repository) IsActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error) {
	ca := r.q.CoachAthlete

	count, err := ca.WithContext(ctx).
		Where(
			ca.CoachUserID.Eq(coachID),
			ca.AthleteUserID.Eq(athleteID),
			ca.Status.Eq(StatusActive),
		).
		Count()
	if err != nil {
		return false, fmt.Errorf("look up coaching link: %w", err)
	}

	return count > 0, nil
}
