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

// ─── GetExercisesByIds ──────────────────────────────────────────────────────

func TestRepositoryGetExercisesByIds_EmptyInputSkipsQuery(t *testing.T) {
	db, mock := newMockDB(t)

	got, err := NewRepository(db).GetExercisesByIds(context.Background(), nil)
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

func TestRepositoryGetExercisesByIds_ReturnsMap(t *testing.T) {
	db, mock := newMockDB(t)

	id1, id2 := uuid.New(), uuid.New()
	ids := []uuid.UUID{id1, id2}

	rows := sqlmock.NewRows([]string{"id", "name"}).
		AddRow(id1, "Squat").
		AddRow(id2, "Bench")

	mock.ExpectQuery(`SELECT "exercises"\."id","exercises"\."name" FROM "exercises" WHERE "exercises"\."id" IN \(\$1,\$2\) AND "exercises"\."deleted_at" IS NULL`).
		WithArgs(uuidArg(id1), uuidArg(id2)).
		WillReturnRows(rows)

	got, err := NewRepository(db).GetExercisesByIds(context.Background(), ids)
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

func TestRepositoryGetExercisesByIds_DBError(t *testing.T) {
	db, mock := newMockDB(t)
	id := uuid.New()

	mock.ExpectQuery(`SELECT "exercises"\."id","exercises"\."name" FROM "exercises"`).
		WithArgs(uuidArg(id)).
		WillReturnError(errors.New("conn closed"))

	_, err := NewRepository(db).GetExercisesByIds(context.Background(), []uuid.UUID{id})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── GetProgramsByUserId ────────────────────────────────────────────────────

func TestRepositoryGetProgramsByUserId_FiltersByOwnerAndOrders(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	p1, p2 := uuid.New(), uuid.New()
	now := time.Now()

	mock.ExpectQuery(`SELECT \* FROM "programs" WHERE "programs"\."owner_user_id" = \$1 AND "programs"\."deleted_at" IS NULL ORDER BY "programs"\."created_at"`).
		WithArgs(uuidArg(ownerID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "owner_user_id", "name", "description", "created_at", "updated_at", "deleted_at",
		}).
			AddRow(p1, ownerID, "Alpha", nil, now, now, nil).
			AddRow(p2, ownerID, "Beta", nil, now, now, nil))

	got, err := NewRepository(db).GetProgramsByUserId(context.Background(), ownerID)
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

func TestRepositoryGetProgramsByUserId_EmptyResultReturnsEmpty(t *testing.T) {
	db, mock := newMockDB(t)
	ownerID := uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(ownerID)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	got, err := NewRepository(db).GetProgramsByUserId(context.Background(), ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %d entries", len(got))
	}
}

func TestRepositoryGetProgramsByUserId_DBErrorBubbles(t *testing.T) {
	db, mock := newMockDB(t)
	ownerID := uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(ownerID)).
		WillReturnError(errors.New("conn closed"))

	_, err := NewRepository(db).GetProgramsByUserId(context.Background(), ownerID)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── GetProgramById ─────────────────────────────────────────────────────────

func TestRepositoryGetProgramById_HappyPathPreloadsEntireAggregate(t *testing.T) {
	db, mock := newMockDB(t)

	programID := uuid.New()
	ownerID := uuid.New()
	weekID := uuid.New()
	dayID := uuid.New()
	peID := uuid.New()
	pstID := uuid.New()
	exID := uuid.New()
	now := time.Now()

	mock.ExpectQuery(`SELECT \* FROM "programs" WHERE "programs"\."id" = \$1 AND "programs"\."owner_user_id" = \$2 AND "programs"\."deleted_at" IS NULL ORDER BY "programs"\."id" LIMIT \$3`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "owner_user_id", "name", "description",
			"created_at", "updated_at", "deleted_at",
		}).AddRow(programID, ownerID, "Prog", nil, now, now, nil))

	mock.ExpectQuery(`SELECT \* FROM "program_weeks" WHERE "program_weeks"\."program_id" = \$1`).
		WithArgs(uuidArg(programID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "program_id", "sequence", "name", "notes", "created_at", "updated_at",
		}).AddRow(weekID, programID, 1, nil, nil, now, now))

	mock.ExpectQuery(`SELECT \* FROM "program_days" WHERE "program_days"\."program_week_id" = \$1`).
		WithArgs(uuidArg(weekID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "program_week_id", "sequence", "name", "tag", "is_rest_day", "notes", "created_at", "updated_at",
		}).AddRow(dayID, weekID, 1, "Day 1", nil, false, nil, now, now))

	mock.ExpectQuery(`SELECT \* FROM "program_exercises" WHERE "program_exercises"\."program_day_id" = \$1`).
		WithArgs(uuidArg(dayID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "program_day_id", "sequence", "exercise_id", "sub_text", "rest_seconds", "created_at", "updated_at",
		}).AddRow(peID, dayID, 1, exID, nil, nil, now, now))

	mock.ExpectQuery(`SELECT \* FROM "program_set_targets" WHERE "program_set_targets"\."program_exercise_id" = \$1`).
		WithArgs(uuidArg(peID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "program_exercise_id", "sequence", "set_type", "sets_count",
			"reps_min", "reps_max",
			"intensity_text", "prescribed_load_kg", "prescribed_load_modifier",
			"cap_load_kg", "prescribed_rpe", "created_at", "updated_at",
		}).AddRow(
			pstID, peID, 1, "working", 1,
			nil, nil,
			nil, nil, "absolute",
			nil, nil, now, now,
		))

	prog, err := NewRepository(db).GetProgramById(context.Background(), programID, ownerID)
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

func TestRepositoryGetProgramById_NotFoundBubbles(t *testing.T) {
	db, mock := newMockDB(t)
	programID, ownerID := uuid.New(), uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := NewRepository(db).GetProgramById(context.Background(), programID, ownerID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryGetProgramById_DBErrorBubbles(t *testing.T) {
	db, mock := newMockDB(t)
	programID, ownerID := uuid.New(), uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnError(errors.New("network down"))

	_, err := NewRepository(db).GetProgramById(context.Background(), programID, ownerID)
	if err == nil || errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected raw db error to bubble, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}
