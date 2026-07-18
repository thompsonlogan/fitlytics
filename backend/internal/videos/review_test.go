package videos

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

const markReviewedUpdate = `UPDATE "set_videos" SET "reviewed_at"=\$1,"reviewed_by_user_id"=\$2,"updated_at"=\$3 ` +
	`WHERE "set_videos"\."id" = \$4 AND "set_videos"\."status" = \$5 ` +
	`AND "set_videos"\."reviewed_at" IS NULL AND "set_videos"\."deleted_at" IS NULL`

func TestRepositoryMarkReviewed_ScopesToReadyAndUnreviewed(t *testing.T) {
	db, mock := newMockDB(t)
	videoID, reviewer := uuid.New(), uuid.New()

	mock.ExpectBegin()
	mock.ExpectExec(markReviewedUpdate).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	mock.ExpectQuery(`SELECT \* FROM "set_videos" WHERE "set_videos"\."id" = \$1`).
		WithArgs(uuidArg(videoID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "status"}).AddRow(videoID, "ready"))

	row, err := NewRepository(db).MarkReviewed(context.Background(), videoID, reviewer)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if row == nil {
		t.Fatal("want the updated row back")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryMarkReviewed_NoRowsAffectedIsRecordNotFound(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(markReviewedUpdate).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	_, err := NewRepository(db).MarkReviewed(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("want ErrRecordNotFound, got %v", err)
	}
}

// ─── service ────────────────────────────────────────────────────────────────

func TestServiceMarkReviewed_MapsNotFound(t *testing.T) {
	repo := &fakeRepo{
		markReviewedFn: func(context.Context, uuid.UUID, uuid.UUID) (*generated.SetVideo, error) {
			return nil, gorm.ErrRecordNotFound
		},
	}

	_, err := NewService(repo, &fakeStore{}, testLimits(), silentLogger()).
		MarkReviewed(context.Background(), uuid.New(), uuid.New())

	if !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

func TestServiceMarkReviewed_PassesTheReviewerThrough(t *testing.T) {
	var gotVideo, gotReviewer uuid.UUID
	videoID, reviewer := uuid.New(), uuid.New()

	repo := &fakeRepo{
		markReviewedFn: func(_ context.Context, v, r uuid.UUID) (*generated.SetVideo, error) {
			gotVideo, gotReviewer = v, r
			return &generated.SetVideo{ID: v, Status: "ready", StorageKey: "k.mp4", ReviewedByUserID: &r}, nil
		},
	}

	resp, err := NewService(repo, &fakeStore{}, testLimits(), silentLogger()).
		MarkReviewed(context.Background(), videoID, reviewer)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if gotVideo != videoID || gotReviewer != reviewer {
		t.Errorf("ids must reach the repo unswapped: video=%v reviewer=%v", gotVideo, gotReviewer)
	}
	// The response carries the attribution, so the UI can say who cleared it.
	if resp.ReviewedByUserID == nil || *resp.ReviewedByUserID != reviewer {
		t.Errorf("response should carry the reviewer, got %v", resp.ReviewedByUserID)
	}
}
