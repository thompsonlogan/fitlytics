package videos

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gen/field"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
	"github.com/thompsonlogan/fitlytics/backend/internal/query"
)

var ErrQuotaExceeded = errors.New("video quota exceeded")

type Repository interface {
	VerifySetLogOwned(ctx context.Context, sessionID, setLogID, ownerID uuid.UUID) error
	CreateUpload(ctx context.Context, ownerID uuid.UUID, row *generated.SetVideo, maxPerUser, maxPerDay int) (oldStorageKey string, err error)
	GetOwned(ctx context.Context, videoID, ownerID uuid.UUID) (*generated.SetVideo, error)
	MarkReady(ctx context.Context, videoID uuid.UUID, sizeBytes int64) (*generated.SetVideo, error)
	MarkFailed(ctx context.Context, videoID uuid.UUID) error
	UpdateNote(ctx context.Context, videoID, ownerID uuid.UUID, note *string) (*generated.SetVideo, error)
	SoftDelete(ctx context.Context, videoID, ownerID uuid.UUID) (storageKey string, err error)
	ListBySession(ctx context.Context, sessionID, ownerID uuid.UUID) ([]generated.SetVideo, error)
}

type repository struct {
	db *gorm.DB
	q  *query.Query
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db, q: query.Use(db)}
}

func (r *repository) VerifySetLogOwned(ctx context.Context, sessionID, setLogID, ownerID uuid.UUID) error {
	sl := r.q.SetLog
	se := r.q.SessionExercise
	ss := r.q.Session

	setLog, err := sl.WithContext(ctx).Where(sl.ID.Eq(setLogID)).First()
	if err != nil {
		return err
	}
	if _, err := se.WithContext(ctx).
		Where(se.ID.Eq(setLog.SessionExerciseID), se.SessionID.Eq(sessionID)).
		First(); err != nil {
		return err
	}
	_, err = ss.WithContext(ctx).Where(ss.ID.Eq(sessionID), ss.UserID.Eq(ownerID)).First()
	return err
}

func (r *repository) CreateUpload(ctx context.Context, ownerID uuid.UUID, row *generated.SetVideo, maxPerUser, maxPerDay int) (string, error) {
	var oldKey string

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := query.Use(tx)
		sv := q.SetVideo

		total, err := sv.WithContext(ctx).Where(sv.UserID.Eq(ownerID)).Count()
		if err != nil {
			return fmt.Errorf("count user videos: %w", err)
		}
		if int(total) >= maxPerUser {
			return ErrQuotaExceeded
		}

		since := time.Now().Add(-24 * time.Hour)
		recent, err := sv.WithContext(ctx).Unscoped().
			Where(sv.UserID.Eq(ownerID), sv.CreatedAt.Gt(since)).Count()
		if err != nil {
			return fmt.Errorf("count recent videos: %w", err)
		}
		if int(recent) >= maxPerDay {
			return ErrQuotaExceeded
		}

		existing, err := sv.WithContext(ctx).Where(sv.SetLogID.Eq(row.SetLogID)).First()
		switch {
		case err == nil:
			oldKey = existing.StorageKey
			if _, derr := sv.WithContext(ctx).Where(sv.ID.Eq(existing.ID)).Delete(); derr != nil {
				return fmt.Errorf("soft-delete existing video: %w", derr)
			}
		case errors.Is(err, gorm.ErrRecordNotFound):
			// nothing to replace
		default:
			return fmt.Errorf("lookup existing video: %w", err)
		}

		if err := sv.WithContext(ctx).Create(row); err != nil {
			return fmt.Errorf("insert video: %w", err)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return oldKey, nil
}

func (r *repository) GetOwned(ctx context.Context, videoID, ownerID uuid.UUID) (*generated.SetVideo, error) {
	sv := r.q.SetVideo
	return sv.WithContext(ctx).Where(sv.ID.Eq(videoID), sv.UserID.Eq(ownerID)).First()
}

func (r *repository) MarkReady(ctx context.Context, videoID uuid.UUID, sizeBytes int64) (*generated.SetVideo, error) {
	sv := r.q.SetVideo
	if _, err := sv.WithContext(ctx).Where(sv.ID.Eq(videoID)).
		UpdateSimple(sv.Status.Value("ready"), sv.SizeBytes.Value(sizeBytes)); err != nil {
		return nil, fmt.Errorf("mark ready: %w", err)
	}
	return sv.WithContext(ctx).Where(sv.ID.Eq(videoID)).First()
}

func (r *repository) MarkFailed(ctx context.Context, videoID uuid.UUID) error {
	sv := r.q.SetVideo
	_, err := sv.WithContext(ctx).Where(sv.ID.Eq(videoID)).UpdateSimple(sv.Status.Value("failed"))
	return err
}

func (r *repository) UpdateNote(ctx context.Context, videoID, ownerID uuid.UUID, note *string) (*generated.SetVideo, error) {
	sv := r.q.SetVideo

	if _, err := sv.WithContext(ctx).Where(sv.ID.Eq(videoID), sv.UserID.Eq(ownerID)).First(); err != nil {
		return nil, err
	}

	var assign field.AssignExpr
	if note == nil {
		assign = sv.Note.Null()
	} else {
		assign = sv.Note.Value(*note)
	}
	if _, err := sv.WithContext(ctx).Where(sv.ID.Eq(videoID)).UpdateSimple(assign); err != nil {
		return nil, fmt.Errorf("update note: %w", err)
	}
	return sv.WithContext(ctx).Where(sv.ID.Eq(videoID)).First()
}

func (r *repository) SoftDelete(ctx context.Context, videoID, ownerID uuid.UUID) (string, error) {
	sv := r.q.SetVideo

	row, err := sv.WithContext(ctx).Where(sv.ID.Eq(videoID), sv.UserID.Eq(ownerID)).First()
	if err != nil {
		return "", err
	}
	if _, err := sv.WithContext(ctx).Where(sv.ID.Eq(videoID)).Delete(); err != nil {
		return "", fmt.Errorf("soft-delete video: %w", err)
	}
	return row.StorageKey, nil
}

func (r *repository) ListBySession(ctx context.Context, sessionID, ownerID uuid.UUID) ([]generated.SetVideo, error) {
	ss := r.q.Session
	if _, err := ss.WithContext(ctx).Where(ss.ID.Eq(sessionID), ss.UserID.Eq(ownerID)).First(); err != nil {
		return nil, err
	}

	sv := r.q.SetVideo
	sl := r.q.SetLog
	se := r.q.SessionExercise

	rows, err := sv.WithContext(ctx).
		Join(&generated.SetLog{}, sl.ID.EqCol(sv.SetLogID)).
		Join(&generated.SessionExercise{}, se.ID.EqCol(sl.SessionExerciseID)).
		Where(se.SessionID.Eq(sessionID), sv.UserID.Eq(ownerID)).
		Find()
	if err != nil {
		return nil, fmt.Errorf("list session videos: %w", err)
	}

	out := make([]generated.SetVideo, len(rows))
	for i, row := range rows {
		out[i] = *row
	}
	return out, nil
}
