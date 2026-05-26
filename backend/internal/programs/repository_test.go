package programs

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
)

// newMockDB returns a *gorm.DB wired to an sqlmock driver, plus the mock
// object for setting expectations. The Postgres driver is asked NOT to ping
// (PreferSimpleProtocol: true via WithoutQuoting wouldn't apply; we set
// SkipInitializeWithVersion on the driver config). For unit tests we just
// want a working *gorm.DB that emits SQL we can match against.
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

// uuidArg makes a UUID work as a driver.Value matcher. GORM passes UUIDs as
// their stringified form through the lib/pq driver.
func uuidArg(id uuid.UUID) driver.Value {
	return id.String()
}

// ─── LookupExerciseNames ────────────────────────────────────────────────────

func TestRepositoryLookupExerciseNames_EmptyInputSkipsQuery(t *testing.T) {
	db, mock := newMockDB(t)

	// No SQL expectations set — the call should short-circuit on the empty
	// slice. ExpectationsWereMet will fail if any unexpected query fires.
	got, err := NewRepository(db).LookupExerciseNames(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Errorf("want empty non-nil map, got %v", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected sql calls: %v", err)
	}
}

func TestRepositoryLookupExerciseNames_ReturnsMap(t *testing.T) {
	db, mock := newMockDB(t)

	id1, id2 := uuid.New(), uuid.New()
	ids := []uuid.UUID{id1, id2}

	rows := sqlmock.NewRows([]string{"id", "name"}).
		AddRow(id1, "Squat").
		AddRow(id2, "Bench")

	mock.ExpectQuery(`SELECT id, name FROM "exercises" WHERE id IN \(\$1,\$2\)`).
		WithArgs(uuidArg(id1), uuidArg(id2)).
		WillReturnRows(rows)

	got, err := NewRepository(db).LookupExerciseNames(context.Background(), ids)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[id1] != "Squat" || got[id2] != "Bench" {
		t.Errorf("returned map: %v", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryLookupExerciseNames_DBError(t *testing.T) {
	db, mock := newMockDB(t)
	id := uuid.New()

	mock.ExpectQuery(`SELECT id, name FROM "exercises"`).
		WithArgs(uuidArg(id)).
		WillReturnError(errors.New("conn closed"))

	_, err := NewRepository(db).LookupExerciseNames(context.Background(), []uuid.UUID{id})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── ListByOwner ────────────────────────────────────────────────────────────

func TestRepositoryListByOwner_FiltersByOwnerAndOrders(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	p1, p2 := uuid.New(), uuid.New()
	now := time.Now()

	// soft-delete tables get "deleted_at" IS NULL appended.
	mock.ExpectQuery(`SELECT \* FROM "programs" WHERE owner_user_id = \$1 AND "programs"\."deleted_at" IS NULL ORDER BY created_at ASC`).
		WithArgs(uuidArg(ownerID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "owner_user_id", "name", "description", "created_at", "updated_at", "deleted_at",
		}).
			AddRow(p1, ownerID, "Alpha", nil, now, now, nil).
			AddRow(p2, ownerID, "Beta", nil, now, now, nil))

	got, err := NewRepository(db).ListByOwner(context.Background(), ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 || got[0].Name != "Alpha" || got[1].Name != "Beta" {
		t.Errorf("unexpected rows: %+v", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryListByOwner_EmptyResultReturnsEmpty(t *testing.T) {
	db, mock := newMockDB(t)
	ownerID := uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(ownerID)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	got, err := NewRepository(db).ListByOwner(context.Background(), ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %d entries", len(got))
	}
}

func TestRepositoryListByOwner_DBErrorBubbles(t *testing.T) {
	db, mock := newMockDB(t)
	ownerID := uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(ownerID)).
		WillReturnError(errors.New("conn closed"))

	_, err := NewRepository(db).ListByOwner(context.Background(), ownerID)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── GetFullTree ────────────────────────────────────────────────────────────

func TestRepositoryGetFullTree_HappyPathPreloadsEntireAggregate(t *testing.T) {
	db, mock := newMockDB(t)

	programID := uuid.New()
	ownerID := uuid.New()
	weekID := uuid.New()
	dayID := uuid.New()
	peID := uuid.New()
	pstID := uuid.New()
	exID := uuid.New()
	now := time.Now()

	// GORM appends `"programs"."deleted_at" IS NULL` because programs has a
	// gorm.DeletedAt column. The other tables don't have soft delete so they
	// query without that clause.
	mock.ExpectQuery(`SELECT \* FROM "programs" WHERE \(id = \$1 AND owner_user_id = \$2\) AND "programs"\."deleted_at" IS NULL ORDER BY "programs"\."id" LIMIT \$3`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "owner_user_id", "name", "description",
			"created_at", "updated_at", "deleted_at",
		}).AddRow(programID, ownerID, "Prog", nil, now, now, nil))

	// Weeks for the program — sequence ASC ordering from the preload scope.
	mock.ExpectQuery(`SELECT \* FROM "program_weeks" WHERE "program_weeks"\."program_id" = \$1 ORDER BY sequence ASC`).
		WithArgs(uuidArg(programID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "program_id", "sequence", "name", "notes", "created_at", "updated_at",
		}).AddRow(weekID, programID, 1, nil, nil, now, now))

	mock.ExpectQuery(`SELECT \* FROM "program_days" WHERE "program_days"\."week_id" = \$1 ORDER BY sequence ASC`).
		WithArgs(uuidArg(weekID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "week_id", "sequence", "name", "tag", "is_rest_day", "notes", "created_at", "updated_at",
		}).AddRow(dayID, weekID, 1, "Day 1", nil, false, nil, now, now))

	mock.ExpectQuery(`SELECT \* FROM "program_exercises" WHERE "program_exercises"\."day_id" = \$1 ORDER BY sequence ASC`).
		WithArgs(uuidArg(dayID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "day_id", "sequence", "exercise_id", "sub_text", "rest_seconds", "notes", "extras", "created_at", "updated_at",
		}).AddRow(peID, dayID, 1, exID, nil, nil, nil, []byte("{}"), now, now))

	mock.ExpectQuery(`SELECT \* FROM "program_set_targets" WHERE "program_set_targets"\."program_exercise_id" = \$1 ORDER BY sequence ASC`).
		WithArgs(uuidArg(peID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "program_exercise_id", "sequence", "set_type", "sets_count",
			"reps_min", "reps_max", "duration_target_sec", "distance_target_m",
			"intensity_text", "prescribed_load_kg", "prescribed_load_modifier",
			"cap_load_kg", "prescribed_rpe", "notes", "extras", "created_at", "updated_at",
		}).AddRow(
			pstID, peID, 1, "working", 1,
			nil, nil, nil, nil,
			nil, nil, "absolute",
			nil, nil, nil, []byte("{}"), now, now,
		))

	prog, err := NewRepository(db).GetFullTree(context.Background(), programID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if prog.ID != programID {
		t.Errorf("program id: want %v, got %v", programID, prog.ID)
	}
	if len(prog.Weeks) != 1 || len(prog.Weeks[0].Days) != 1 ||
		len(prog.Weeks[0].Days[0].Exercises) != 1 ||
		len(prog.Weeks[0].Days[0].Exercises[0].SetTargets) != 1 {
		t.Errorf("tree shape: %+v", prog)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryGetFullTree_NotFoundBubbles(t *testing.T) {
	db, mock := newMockDB(t)
	programID, ownerID := uuid.New(), uuid.New()

	// Empty result set → GORM returns ErrRecordNotFound from First.
	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := NewRepository(db).GetFullTree(context.Background(), programID, ownerID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryGetFullTree_DBErrorBubbles(t *testing.T) {
	db, mock := newMockDB(t)
	programID, ownerID := uuid.New(), uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnError(errors.New("network down"))

	_, err := NewRepository(db).GetFullTree(context.Background(), programID, ownerID)
	if err == nil || errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected raw db error to bubble, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

