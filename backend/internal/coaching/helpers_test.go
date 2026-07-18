package coaching

import (
	"context"
	"database/sql/driver"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// fixedID makes deterministic UUIDs from a label so failures name the entity
// they involve instead of a random hex string.
func fixedID(label string) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("fitlytics-test:"+label))
}

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

// ── Fixtures ────────────────────────────────────────────────────────────────

var (
	coachID   = fixedID("user:coach")
	athleteID = fixedID("user:athlete")
)

// ── Test doubles ────────────────────────────────────────────────────────────

// fakeRepository stubs the guard. A nil function field reports an active link,
// so a test that does not care about authorization does not have to wire it.
type fakeRepository struct {
	isActiveCoachFn func(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error)
}

func (f *fakeRepository) IsActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error) {
	if f.isActiveCoachFn == nil {
		return true, nil
	}
	return f.isActiveCoachFn(ctx, coachID, athleteID)
}
