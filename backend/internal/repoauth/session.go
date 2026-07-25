package repoauth

import (
	"context"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/query"
)

func SessionOwner(ctx context.Context, q *query.Query, sessionID uuid.UUID) (uuid.UUID, error) {
	s := q.Session

	row, err := s.WithContext(ctx).
		Select(s.UserID).
		Where(s.ID.Eq(sessionID)).
		First()
	if err != nil {
		return uuid.Nil, err
	}
	return row.UserID, nil
}

func VideoOwner(ctx context.Context, q *query.Query, videoID uuid.UUID) (uuid.UUID, error) {
	v := q.SetVideo

	row, err := v.WithContext(ctx).
		Select(v.UserID).
		Where(v.ID.Eq(videoID)).
		First()
	if err != nil {
		return uuid.Nil, err
	}
	return row.UserID, nil
}
