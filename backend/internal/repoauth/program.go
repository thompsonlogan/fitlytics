package repoauth

import (
	"context"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/query"
)

func ProgramOwner(ctx context.Context, q *query.Query, programID uuid.UUID) (uuid.UUID, error) {
	p := q.Program

	row, err := p.WithContext(ctx).
		Select(p.OwnerUserID).
		Where(p.ID.Eq(programID)).
		First()
	if err != nil {
		return uuid.Nil, err
	}
	return row.OwnerUserID, nil
}
