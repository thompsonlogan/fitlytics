package repoauth

import (
	"context"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
	"github.com/thompsonlogan/fitlytics/backend/internal/query"
)

func SetLogOwnedBySession(ctx context.Context, q *query.Query, sessionID, setLogID, ownerID uuid.UUID) (*generated.SetLog, error) {
	sl := q.SetLog
	se := q.SessionExercise
	ss := q.Session

	return sl.WithContext(ctx).
		Join(&generated.SessionExercise{}, se.ID.EqCol(sl.SessionExerciseID)).
		Join(&generated.Session{}, ss.ID.EqCol(se.SessionID)).
		Where(sl.ID.Eq(setLogID), se.SessionID.Eq(sessionID), ss.UserID.Eq(ownerID)).
		First()
}
