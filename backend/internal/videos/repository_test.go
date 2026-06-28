package videos

import (
	"context"
	"database/sql/driver"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("gorm.Open: %v", err)
	}
	return gormDB, mock
}

func uuidArg(id uuid.UUID) driver.Value {
	return id.String()
}

func expectVideoQuotaLock(mock sqlmock.Sqlmock, ownerID uuid.UUID) {
	mock.ExpectExec(`select pg_advisory_xact_lock`).
		WithArgs(uuidArg(ownerID)).
		WillReturnResult(sqlmock.NewResult(0, 0))
}

func expectNoExistingVideoForSet(mock sqlmock.Sqlmock, setLogID uuid.UUID) {
	mock.ExpectQuery(`SELECT \* FROM "set_videos" WHERE.*set_log_id`).
		WithArgs(uuidArg(setLogID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
}

func expectActiveVideoCount(mock sqlmock.Sqlmock, ownerID uuid.UUID, count int) {
	mock.ExpectQuery(`SELECT count\(\*\) FROM "set_videos" WHERE .*"set_videos"\."status" <> .*deleted_at`).
		WithArgs(uuidArg(ownerID), "failed").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(count))
}

func expectRecentVideoAttemptCount(mock sqlmock.Sqlmock, ownerID uuid.UUID, count int) {
	// Unscoped abuse/rate cap: deleted_at must NOT appear. Anchored to $ so any
	// appended soft-delete clause breaks the match.
	mock.ExpectQuery(`SELECT count\(\*\) FROM "set_videos" WHERE "set_videos"\."user_id" = \$1 AND "set_videos"\."created_at" > \$2$`).
		WithArgs(uuidArg(ownerID), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(count))
}

// ─── GetOwned ───────────────────────────────────────────────────────────────

const setLogOwnedBySessionQuery = `SELECT .* FROM "set_logs" .*JOIN "session_exercises".*JOIN "sessions".*WHERE "set_logs"\."id" = \$1 AND "session_exercises"\."session_id" = \$2 AND "sessions"\."user_id" = \$3.*LIMIT`

func TestRepositoryGetOwned_FiltersByOwner(t *testing.T) {
	db, mock := newMockDB(t)

	videoID := uuid.New()
	ownerID := uuid.New()
	setLogID := uuid.New()
	now := time.Now()

	mock.ExpectQuery(`SELECT \* FROM "set_videos" WHERE`).
		WithArgs(uuidArg(videoID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "set_log_id", "user_id", "status", "storage_key", "created_at", "updated_at",
		}).AddRow(videoID, setLogID, ownerID, "pending", "users/u/set-videos/v.mp4", now, now))

	got, err := NewRepository(db).GetOwned(context.Background(), videoID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != videoID {
		t.Errorf("id: want %v, got %v", videoID, got.ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── CreateUpload ────────────────────────────────────────────────────────────

func TestRepositoryCreateUpload_HappyPathNoExisting(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	setLogID := uuid.New()
	videoID := uuid.New()
	now := time.Now()

	mock.ExpectBegin()

	// Transaction-scoped per-user lock serializes quota checks before any counts.
	expectVideoQuotaLock(mock, ownerID)

	// Existing-video lookup returns nothing, so this upload increases active count.
	expectNoExistingVideoForSet(mock, setLogID)

	// Active per-user quota excludes failed rows and uses the soft-delete scope.
	expectActiveVideoCount(mock, ownerID, 0)

	// Per-day quota intentionally counts all recent attempts.
	expectRecentVideoAttemptCount(mock, ownerID, 0)

	// INSERT with RETURNING.
	mock.ExpectQuery(`INSERT INTO "set_videos"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(videoID))

	mock.ExpectCommit()

	row := &generated.SetVideo{
		SetLogID:   setLogID,
		UserID:     ownerID,
		Status:     "pending",
		StorageKey: "users/u/set-videos/new.mp4",
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	oldKey, err := NewRepository(db).CreateUpload(context.Background(), ownerID, row, 200, 50)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if oldKey != "" {
		t.Errorf("want empty oldKey, got %q", oldKey)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryCreateUpload_FailedRowsDoNotConsumePerUserQuota(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	setLogID := uuid.New()
	videoID := uuid.New()
	maxPerUser := 1

	mock.ExpectBegin()
	expectVideoQuotaLock(mock, ownerID)
	expectNoExistingVideoForSet(mock, setLogID)

	// A failed row may exist for this user, but the active quota query excludes
	// status='failed', so the count seen by the quota check is still below cap.
	expectActiveVideoCount(mock, ownerID, 0)
	expectRecentVideoAttemptCount(mock, ownerID, 0)

	mock.ExpectQuery(`INSERT INTO "set_videos"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(videoID))
	mock.ExpectCommit()

	row := &generated.SetVideo{
		SetLogID:   setLogID,
		UserID:     ownerID,
		Status:     "pending",
		StorageKey: "users/u/set-videos/new.mp4",
	}

	if _, err := NewRepository(db).CreateUpload(context.Background(), ownerID, row, maxPerUser, 50); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryCreateUpload_ReplacesExistingAndReturnsOldKey(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	setLogID := uuid.New()
	existingID := uuid.New()
	newVideoID := uuid.New()
	now := time.Now()
	existingKey := "users/u/set-videos/old.mp4"

	mock.ExpectBegin()

	// Transaction-scoped per-user lock serializes quota checks before any counts.
	expectVideoQuotaLock(mock, ownerID)

	// Existing-video lookup returns one row.
	mock.ExpectQuery(`SELECT \* FROM "set_videos" WHERE.*set_log_id`).
		WithArgs(uuidArg(setLogID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "set_log_id", "user_id", "status", "storage_key", "created_at", "updated_at",
		}).AddRow(existingID, setLogID, ownerID, "ready", existingKey, now, now))

	// Existing ready row is subtracted from the active count, so replacing at
	// the cap is allowed instead of temporarily counting as an extra video.
	expectActiveVideoCount(mock, ownerID, 5)

	// Per-day quota intentionally counts this as a new attempt.
	expectRecentVideoAttemptCount(mock, ownerID, 0)

	// Soft-delete the existing row.
	mock.ExpectExec(`UPDATE "set_videos" SET "deleted_at"`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// INSERT the new row.
	mock.ExpectQuery(`INSERT INTO "set_videos"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(newVideoID))

	mock.ExpectCommit()

	row := &generated.SetVideo{
		SetLogID:   setLogID,
		UserID:     ownerID,
		Status:     "pending",
		StorageKey: "users/u/set-videos/new.mp4",
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	oldKey, err := NewRepository(db).CreateUpload(context.Background(), ownerID, row, 5, 50)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if oldKey != existingKey {
		t.Errorf("want oldKey %q, got %q", existingKey, oldKey)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryCreateUpload_PerUserQuotaRollsBack(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	maxPerUser := 5

	mock.ExpectBegin()

	setLogID := uuid.New()
	expectVideoQuotaLock(mock, ownerID)
	expectNoExistingVideoForSet(mock, setLogID)

	// Active count reaches maxPerUser after excluding failed rows.
	expectActiveVideoCount(mock, ownerID, maxPerUser)

	mock.ExpectRollback()

	row := &generated.SetVideo{
		SetLogID:   setLogID,
		UserID:     ownerID,
		StorageKey: "users/u/set-videos/x.mp4",
	}

	_, err := NewRepository(db).CreateUpload(context.Background(), ownerID, row, maxPerUser, 50)
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("want ErrQuotaExceeded, got %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryCreateUpload_PerDayQuotaRollsBack(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	maxPerDay := 10

	mock.ExpectBegin()

	setLogID := uuid.New()
	expectVideoQuotaLock(mock, ownerID)
	expectNoExistingVideoForSet(mock, setLogID)

	// Active per-user quota passes.
	expectActiveVideoCount(mock, ownerID, 0)

	// Trailing 24h all-attempts cap hits; failed/deleted attempts still count.
	expectRecentVideoAttemptCount(mock, ownerID, maxPerDay)

	mock.ExpectRollback()

	row := &generated.SetVideo{
		SetLogID:   setLogID,
		UserID:     ownerID,
		StorageKey: "users/u/set-videos/x.mp4",
	}

	_, err := NewRepository(db).CreateUpload(context.Background(), ownerID, row, 200, maxPerDay)
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("want ErrQuotaExceeded, got %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── VerifySetLogOwned ───────────────────────────────────────────────────────

func TestRepositoryVerifySetLogOwned_HappyPath(t *testing.T) {
	db, mock := newMockDB(t)

	sessionID := uuid.New()
	setLogID := uuid.New()
	ownerID := uuid.New()
	seID := uuid.New()
	now := time.Now()
	// Ownership probe: set_log -> session_exercise -> session.
	mock.ExpectQuery(setLogOwnedBySessionQuery).
		WithArgs(uuidArg(setLogID), uuidArg(sessionID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state", "created_at", "updated_at",
		}).AddRow(setLogID, seID, 1, "working", "pending", now, now))

	err := NewRepository(db).VerifySetLogOwned(context.Background(), sessionID, setLogID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryVerifySetLogOwned_ForeignSessionIsNotFound(t *testing.T) {
	db, mock := newMockDB(t)

	sessionID := uuid.New()
	setLogID := uuid.New()
	ownerID := uuid.New()

	// Ownership probe returns no matching row.
	mock.ExpectQuery(setLogOwnedBySessionQuery).
		WithArgs(uuidArg(setLogID), uuidArg(sessionID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	err := NewRepository(db).VerifySetLogOwned(context.Background(), sessionID, setLogID, ownerID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── ListBySession ───────────────────────────────────────────────────────────

func TestRepositoryListBySession_ProbesOwnershipThenJoins(t *testing.T) {
	db, mock := newMockDB(t)

	sessionID := uuid.New()
	ownerID := uuid.New()
	vid1, vid2 := uuid.New(), uuid.New()
	setLogID1, setLogID2 := uuid.New(), uuid.New()
	now := time.Now()

	// Ownership probe: sessions by (id, user_id).
	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE`).
		WithArgs(uuidArg(sessionID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "user_id", "state", "created_at", "updated_at",
		}).AddRow(sessionID, ownerID, "in_progress", now, now))

	// JOIN query: set_videos + set_logs + session_exercises.
	mock.ExpectQuery(`SELECT .*"set_videos".* JOIN`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "set_log_id", "user_id", "status", "storage_key", "created_at", "updated_at",
		}).
			AddRow(vid1, setLogID1, ownerID, "ready", "users/u/set-videos/a.mp4", now, now).
			AddRow(vid2, setLogID2, ownerID, "pending", "users/u/set-videos/b.mp4", now, now))

	rows, err := NewRepository(db).ListBySession(context.Background(), sessionID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("want 2 rows, got %d", len(rows))
	}
	if rows[0].ID != vid1 || rows[1].ID != vid2 {
		t.Errorf("unexpected row IDs: %v, %v", rows[0].ID, rows[1].ID)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryListBySession_UnownedSessionShortCircuits(t *testing.T) {
	db, mock := newMockDB(t)

	sessionID := uuid.New()
	ownerID := uuid.New()

	// Ownership probe returns empty → short-circuit, no JOIN query.
	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE`).
		WithArgs(uuidArg(sessionID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	// No further expectations — expectations met proves JOIN never ran.

	_, err := NewRepository(db).ListBySession(context.Background(), sessionID, ownerID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── SoftDelete ──────────────────────────────────────────────────────────────

func TestRepositorySoftDelete_ReturnsKeyAndSoftDeletes(t *testing.T) {
	db, mock := newMockDB(t)

	videoID := uuid.New()
	ownerID := uuid.New()
	setLogID := uuid.New()
	now := time.Now()
	storageKey := "users/u/set-videos/todelete.mp4"

	// Ownership SELECT.
	mock.ExpectQuery(`SELECT \* FROM "set_videos" WHERE`).
		WithArgs(uuidArg(videoID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "set_log_id", "user_id", "status", "storage_key", "created_at", "updated_at",
		}).AddRow(videoID, setLogID, ownerID, "ready", storageKey, now, now))

	// Soft-delete: GORM gen wraps the UPDATE in its own Begin/Commit.
	mock.ExpectBegin()
	mock.ExpectExec(`UPDATE "set_videos" SET "deleted_at"`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	gotKey, err := NewRepository(db).SoftDelete(context.Background(), videoID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotKey != storageKey {
		t.Errorf("want key %q, got %q", storageKey, gotKey)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositorySoftDelete_ForeignVideoIsNotFound(t *testing.T) {
	db, mock := newMockDB(t)

	videoID := uuid.New()
	ownerID := uuid.New()

	// SELECT returns empty rows → not-found, no UPDATE.
	mock.ExpectQuery(`SELECT \* FROM "set_videos" WHERE`).
		WithArgs(uuidArg(videoID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	// No further expectations — proves UPDATE never ran.

	_, err := NewRepository(db).SoftDelete(context.Background(), videoID, ownerID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}
