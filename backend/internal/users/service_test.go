package users

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
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

const (
	findByIDQuery       = `SELECT \* FROM "users" WHERE id = `
	findByWorkOSIDQuery = `SELECT \* FROM "users" WHERE workos_user_id = `
)

// FindByID hits the DB once and serves every subsequent call for the same id
// from the cache.
func TestServiceFindByID_CachesAfterFirstLoad(t *testing.T) {
	db, mock := newMockDB(t)
	id := uuid.New()

	mock.ExpectQuery(findByIDQuery).
		WillReturnRows(sqlmock.NewRows([]string{"id", "workos_user_id", "display_name"}).
			AddRow(id, "user_workos", "Ada"))

	svc := NewService(db, nil)

	for i := 0; i < 3; i++ {
		u, err := svc.FindByID(context.Background(), id)
		if err != nil {
			t.Fatalf("call %d: unexpected error: %v", i, err)
		}
		if u.ID != id || u.DisplayName != "Ada" {
			t.Fatalf("call %d: unexpected user %+v", i, u)
		}
	}

	// Only one DB query was registered; a second hit would be an unmet
	// expectation / unexpected query.
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// A cache hit must hand back an independent copy so a caller mutating the
// returned *User (e.g. the request principal) cannot corrupt the shared entry.
func TestServiceFindByID_ReturnsIndependentCopy(t *testing.T) {
	db, mock := newMockDB(t)
	id := uuid.New()

	mock.ExpectQuery(findByIDQuery).
		WillReturnRows(sqlmock.NewRows([]string{"id", "workos_user_id", "display_name"}).
			AddRow(id, "user_workos", "Ada"))

	svc := NewService(db, nil)

	first, err := svc.FindByID(context.Background(), id)
	if err != nil {
		t.Fatalf("first load: %v", err)
	}
	first.DisplayName = "tampered" // caller mutates its copy

	second, err := svc.FindByID(context.Background(), id) // served from cache
	if err != nil {
		t.Fatalf("cache hit: %v", err)
	}
	if second.DisplayName != "Ada" {
		t.Errorf("cache entry was mutated through returned pointer: %q", second.DisplayName)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ResolveOrProvision caches the resolved row by workos_user_id, so a returning
// user does not re-hit the DB on every request.
func TestServiceResolveOrProvision_CachesByWorkOSID(t *testing.T) {
	db, mock := newMockDB(t)
	id := uuid.New()

	mock.ExpectQuery(findByWorkOSIDQuery).
		WillReturnRows(sqlmock.NewRows([]string{"id", "workos_user_id", "display_name"}).
			AddRow(id, "user_workos", "Ada"))

	svc := NewService(db, nil)
	claims := &auth.Claims{}
	claims.Subject = "user_workos"

	for i := 0; i < 3; i++ {
		u, err := svc.ResolveOrProvision(context.Background(), claims)
		if err != nil {
			t.Fatalf("call %d: unexpected error: %v", i, err)
		}
		if u.ID != id {
			t.Fatalf("call %d: unexpected user %+v", i, u)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// Regression test for option composition: WithCacheSize must be honored even
// when WithCacheTTL is also supplied. With a capacity of 1, loading a second
// user evicts the first, so re-loading the first hits the DB again. (Before the
// fix, WithCacheTTL silently reset the size to the default, the first user
// stayed cached, and the third load would have been an unexpected cache hit.)
func TestServiceWithCacheSize_HonoredAlongsideTTL(t *testing.T) {
	db, mock := newMockDB(t)
	idA, idB := uuid.New(), uuid.New()

	mock.ExpectQuery(findByIDQuery).
		WillReturnRows(sqlmock.NewRows([]string{"id", "workos_user_id", "display_name"}).
			AddRow(idA, "wa", "A"))
	mock.ExpectQuery(findByIDQuery).
		WillReturnRows(sqlmock.NewRows([]string{"id", "workos_user_id", "display_name"}).
			AddRow(idB, "wb", "B"))
	mock.ExpectQuery(findByIDQuery). // A was evicted, so it loads again
						WillReturnRows(sqlmock.NewRows([]string{"id", "workos_user_id", "display_name"}).
							AddRow(idA, "wa", "A"))

	svc := NewService(db, nil, WithCacheSize(1), WithCacheTTL(time.Minute))

	if _, err := svc.FindByID(context.Background(), idA); err != nil {
		t.Fatalf("load A: %v", err)
	}
	if _, err := svc.FindByID(context.Background(), idB); err != nil { // evicts A
		t.Fatalf("load B: %v", err)
	}
	if _, err := svc.FindByID(context.Background(), idA); err != nil { // must re-hit DB
		t.Fatalf("reload A: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}
