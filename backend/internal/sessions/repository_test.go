package sessions

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

// ─── GetCurrentSessionByDay ─────────────────────────────────────────────────

func TestRepositoryGetCurrentSessionByDay_HappyPathSortsTree(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	dayID := uuid.New()
	sessionID := uuid.New()
	ex1, ex2 := uuid.New(), uuid.New()
	now := time.Now()

	// Main session row.
	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .* ORDER BY "sessions"\."created_at" DESC.* LIMIT`).
		WithArgs(uuidArg(ownerID), uuidArg(dayID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "user_id", "program_day_id", "state", "created_at", "updated_at",
		}).AddRow(sessionID, ownerID, dayID, "in_progress", now, now))

	// Preload exercises — returned out of sequence order to prove the sort.
	mock.ExpectQuery(`SELECT \* FROM "session_exercises"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_id", "sequence", "exercise_id", "exercise_name_snap",
		}).
			AddRow(ex2, sessionID, 2, uuid.New(), "Bench").
			AddRow(ex1, sessionID, 1, uuid.New(), "Squat"))

	// Preload set logs — also out of order, all hanging off ex1.
	mock.ExpectQuery(`SELECT \* FROM "set_logs"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state",
		}).
			AddRow(uuid.New(), ex1, 2, "working", "pending").
			AddRow(uuid.New(), ex1, 1, "working", "completed"))

	session, err := NewRepository(db).GetCurrentSessionByDay(context.Background(), dayID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if session.ID != sessionID {
		t.Errorf("session id: want %v, got %v", sessionID, session.ID)
	}
	if len(session.Exercises) != 2 {
		t.Fatalf("want 2 exercises, got %d", len(session.Exercises))
	}
	if session.Exercises[0].Sequence != 1 || session.Exercises[1].Sequence != 2 {
		t.Errorf("exercises not sorted by sequence: %+v", session.Exercises)
	}
	logs := session.Exercises[0].SetLogs
	if len(logs) != 2 || logs[0].Sequence != 1 || logs[1].Sequence != 2 {
		t.Errorf("set logs not sorted by sequence: %+v", logs)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryGetCurrentSessionByDay_NotFoundBubbles(t *testing.T) {
	db, mock := newMockDB(t)
	dayID, ownerID := uuid.New(), uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "sessions"`).
		WithArgs(uuidArg(ownerID), uuidArg(dayID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := NewRepository(db).GetCurrentSessionByDay(context.Background(), dayID, ownerID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryGetCurrentSessionByDay_DBErrorBubbles(t *testing.T) {
	db, mock := newMockDB(t)
	dayID, ownerID := uuid.New(), uuid.New()

	mock.ExpectQuery(`SELECT \* FROM "sessions"`).
		WithArgs(uuidArg(ownerID), uuidArg(dayID), 1).
		WillReturnError(errors.New("network down"))

	_, err := NewRepository(db).GetCurrentSessionByDay(context.Background(), dayID, ownerID)
	if err == nil || errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected raw db error to bubble, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── StartSessionForDay ─────────────────────────────────────────────────────

func TestRepositoryStartSessionForDay_ReusesExistingSession(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	programID := uuid.New()
	dayID := uuid.New()
	sessionID := uuid.New()
	exID := uuid.New()
	now := time.Now()

	mock.ExpectBegin()

	// Existing session is found, so the create path is skipped entirely.
	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .* ORDER BY "sessions"\."created_at" DESC.* LIMIT`).
		WithArgs(uuidArg(ownerID), uuidArg(dayID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "user_id", "program_day_id", "state", "created_at", "updated_at",
		}).AddRow(sessionID, ownerID, dayID, "in_progress", now, now))

	mock.ExpectQuery(`SELECT \* FROM "session_exercises"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_id", "sequence", "exercise_id", "exercise_name_snap",
		}).AddRow(exID, sessionID, 1, uuid.New(), "Squat"))

	mock.ExpectQuery(`SELECT \* FROM "set_logs"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state",
		}).AddRow(uuid.New(), exID, 1, "working", "pending"))

	mock.ExpectCommit()

	session, err := NewRepository(db).StartSessionForDay(context.Background(), programID, dayID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if session.ID != sessionID {
		t.Errorf("session id: want %v, got %v", sessionID, session.ID)
	}
	if len(session.Exercises) != 1 {
		t.Errorf("want 1 exercise, got %d", len(session.Exercises))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryStartSessionForDay_SnapshotsProgramIntoNewSession(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	programID := uuid.New()
	dayID := uuid.New()
	weekID := uuid.New()
	peID := uuid.New()
	pstID := uuid.New()
	exID := uuid.New()
	newSessionID := uuid.New()
	newSeID := uuid.New()
	newLogID := uuid.New()
	now := time.Now()

	mock.ExpectBegin()

	// 1) No existing session for the day.
	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .* ORDER BY "sessions"\."created_at" DESC.* LIMIT`).
		WithArgs(uuidArg(ownerID), uuidArg(dayID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	// 2) Program ownership probe succeeds.
	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "owner_user_id", "name", "created_at", "updated_at",
		}).AddRow(programID, ownerID, "Prog", now, now))

	// 2b) The program day join resolves the day name.
	mock.ExpectQuery(`SELECT .* FROM "program_days" .*JOIN "program_weeks"`).
		WithArgs(uuidArg(dayID), uuidArg(programID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "week_id", "sequence", "name", "is_rest_day", "created_at", "updated_at",
		}).AddRow(dayID, weekID, 1, "Day 1", false, now, now))

	// 3) Program exercises + preloaded set targets for the snapshot.
	mock.ExpectQuery(`SELECT \* FROM "program_exercises" WHERE`).
		WithArgs(uuidArg(dayID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "day_id", "sequence", "exercise_id", "sub_text", "rest_seconds", "created_at", "updated_at",
		}).AddRow(peID, dayID, 1, exID, "Belt", 180, now, now))

	mock.ExpectQuery(`SELECT \* FROM "program_set_targets"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "program_exercise_id", "sequence", "set_type", "sets_count", "prescribed_load_modifier", "created_at", "updated_at",
		}).AddRow(pstID, peID, 1, "working", 1, "absolute", now, now))

	// 3b) Bulk exercise-name lookup for name_snap.
	mock.ExpectQuery(`SELECT "exercises"\."id","exercises"\."name" FROM "exercises"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(exID, "Squat"))

	// 4) Insert the session row (postgres RETURNING id).
	mock.ExpectQuery(`INSERT INTO "sessions"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(newSessionID))

	// 5) Insert the session exercise + its set log.
	mock.ExpectQuery(`INSERT INTO "session_exercises"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(newSeID))
	mock.ExpectQuery(`INSERT INTO "set_logs"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(newLogID))

	// 6) Reload the freshly created aggregate.
	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .*"sessions"\."id" = \$1.* LIMIT`).
		WithArgs(uuidArg(newSessionID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "user_id", "program_day_id", "state", "created_at", "updated_at",
		}).AddRow(newSessionID, ownerID, dayID, "planned", now, now))
	mock.ExpectQuery(`SELECT \* FROM "session_exercises"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_id", "sequence", "exercise_id", "exercise_name_snap",
		}).AddRow(newSeID, newSessionID, 1, exID, "Squat"))
	mock.ExpectQuery(`SELECT \* FROM "set_logs"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state",
		}).AddRow(newLogID, newSeID, 1, "working", "pending"))

	mock.ExpectCommit()

	session, err := NewRepository(db).StartSessionForDay(context.Background(), programID, dayID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if session.ID != newSessionID || session.State != "planned" {
		t.Errorf("created session: %+v", session)
	}
	if len(session.Exercises) != 1 || len(session.Exercises[0].SetLogs) != 1 {
		t.Errorf("snapshot tree shape: %+v", session)
	}
	if session.Exercises[0].ExerciseNameSnap != "Squat" {
		t.Errorf("exercise name snapshot: %q", session.Exercises[0].ExerciseNameSnap)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryStartSessionForDay_ExpandsSetsCountIntoPerSetLogs(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	programID := uuid.New()
	dayID := uuid.New()
	weekID := uuid.New()
	peID := uuid.New()
	pstID := uuid.New()
	exID := uuid.New()
	newSessionID := uuid.New()
	newSeID := uuid.New()
	logID1 := uuid.New()
	logID2 := uuid.New()
	now := time.Now()

	mock.ExpectBegin()

	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .* ORDER BY "sessions"\."created_at" DESC.* LIMIT`).
		WithArgs(uuidArg(ownerID), uuidArg(dayID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "owner_user_id", "name", "created_at", "updated_at",
		}).AddRow(programID, ownerID, "Prog", now, now))

	mock.ExpectQuery(`SELECT .* FROM "program_days" .*JOIN "program_weeks"`).
		WithArgs(uuidArg(dayID), uuidArg(programID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "week_id", "sequence", "name", "is_rest_day", "created_at", "updated_at",
		}).AddRow(dayID, weekID, 1, "Day 1", false, now, now))

	mock.ExpectQuery(`SELECT \* FROM "program_exercises" WHERE`).
		WithArgs(uuidArg(dayID)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "day_id", "sequence", "exercise_id", "sub_text", "rest_seconds", "created_at", "updated_at",
		}).AddRow(peID, dayID, 1, exID, nil, nil, now, now))

	// One block prescribing two sets.
	mock.ExpectQuery(`SELECT \* FROM "program_set_targets"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "program_exercise_id", "sequence", "set_type", "sets_count", "prescribed_load_modifier", "created_at", "updated_at",
		}).AddRow(pstID, peID, 1, "working", 2, "absolute", now, now))

	mock.ExpectQuery(`SELECT "exercises"\."id","exercises"\."name" FROM "exercises"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(exID, "Squat"))

	mock.ExpectQuery(`INSERT INTO "sessions"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(newSessionID))

	mock.ExpectQuery(`INSERT INTO "session_exercises"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(newSeID))
	// The two expanded set_logs are inserted in a single batch returning two ids.
	mock.ExpectQuery(`INSERT INTO "set_logs"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(logID1).AddRow(logID2))

	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .*"sessions"\."id" = \$1.* LIMIT`).
		WithArgs(uuidArg(newSessionID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "user_id", "program_day_id", "state", "created_at", "updated_at",
		}).AddRow(newSessionID, ownerID, dayID, "planned", now, now))
	mock.ExpectQuery(`SELECT \* FROM "session_exercises"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_id", "sequence", "exercise_id", "exercise_name_snap",
		}).AddRow(newSeID, newSessionID, 1, exID, "Squat"))
	mock.ExpectQuery(`SELECT \* FROM "set_logs"`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "block_sequence", "set_type", "state",
		}).
			AddRow(logID1, newSeID, 1, 1, "working", "pending").
			AddRow(logID2, newSeID, 2, 1, "working", "pending"))

	mock.ExpectCommit()

	session, err := NewRepository(db).StartSessionForDay(context.Background(), programID, dayID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(session.Exercises) != 1 || len(session.Exercises[0].SetLogs) != 2 {
		t.Fatalf("expected one exercise with two set logs, got: %+v", session)
	}
	logs := session.Exercises[0].SetLogs
	for i, l := range logs {
		if l.BlockSequence == nil || *l.BlockSequence != 1 {
			t.Errorf("set log %d: expected block_sequence 1, got %v", i, l.BlockSequence)
		}
		if l.Sequence != int32(i+1) {
			t.Errorf("set log %d: expected sequence %d, got %d", i, i+1, l.Sequence)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryStartSessionForDay_UnknownProgramRollsBack(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	programID := uuid.New()
	dayID := uuid.New()

	mock.ExpectBegin()

	// No existing session for the day.
	mock.ExpectQuery(`SELECT \* FROM "sessions"`).
		WithArgs(uuidArg(ownerID), uuidArg(dayID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	// Program ownership probe finds nothing → not-found bubbles up.
	mock.ExpectQuery(`SELECT \* FROM "programs"`).
		WithArgs(uuidArg(programID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	mock.ExpectRollback()

	_, err := NewRepository(db).StartSessionForDay(context.Background(), programID, dayID, ownerID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── UpdateSetLog ───────────────────────────────────────────────────────────

func TestRepositoryUpdateSetLog_CompletesSessionWhenNoPending(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	sessionID := uuid.New()
	setLogID := uuid.New()
	seID := uuid.New()
	now := time.Now()

	mock.ExpectBegin()

	// Ownership probe: set_log → session_exercise → session.
	mock.ExpectQuery(`SELECT \* FROM "set_logs" WHERE .*"set_logs"\."id" = \$1.* LIMIT`).
		WithArgs(uuidArg(setLogID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state",
		}).AddRow(setLogID, seID, 1, "working", "pending"))

	mock.ExpectQuery(`SELECT \* FROM "session_exercises" WHERE .* LIMIT`).
		WithArgs(uuidArg(seID), uuidArg(sessionID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_id", "sequence", "exercise_id", "exercise_name_snap",
		}).AddRow(seID, sessionID, 1, uuid.New(), "Squat"))

	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .* LIMIT`).
		WithArgs(uuidArg(sessionID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "user_id", "state", "created_at", "updated_at",
		}).AddRow(sessionID, ownerID, "in_progress", now, now))

	// Apply the field update.
	mock.ExpectExec(`UPDATE "set_logs" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Recompute state: list session exercises, then their set log states.
	mock.ExpectQuery(`SELECT "session_exercises"\."id" FROM "session_exercises"`).
		WithArgs(uuidArg(sessionID)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(seID))

	mock.ExpectQuery(`SELECT "set_logs"\."state" FROM "set_logs"`).
		WithArgs(uuidArg(seID)).
		WillReturnRows(sqlmock.NewRows([]string{"state"}).AddRow("completed"))

	// All set logs complete → session transitions to completed.
	mock.ExpectExec(`UPDATE "sessions" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Final reload of the updated set log.
	mock.ExpectQuery(`SELECT \* FROM "set_logs" WHERE .*"set_logs"\."id" = \$1.* LIMIT`).
		WithArgs(uuidArg(setLogID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state",
		}).AddRow(setLogID, seID, 1, "working", "completed"))

	mock.ExpectCommit()

	out, err := NewRepository(db).UpdateSetLog(context.Background(), sessionID, setLogID, ownerID,
		UpdateSetLogRequest{State: ptr("completed")})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.ID != setLogID || out.State != "completed" {
		t.Errorf("returned set log: %+v", out)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryUpdateSetLog_MissingSetLogRollsBack(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	sessionID := uuid.New()
	setLogID := uuid.New()

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT \* FROM "set_logs"`).
		WithArgs(uuidArg(setLogID), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectRollback()

	_, err := NewRepository(db).UpdateSetLog(context.Background(), sessionID, setLogID, ownerID,
		UpdateSetLogRequest{State: ptr("completed")})
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── UpdateSetLogs ──────────────────────────────────────────────────────────

func TestRepositoryUpdateSetLogs_AppliesAllInOneTransaction(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	sessionID := uuid.New()
	seID := uuid.New()
	logID1 := uuid.New()
	logID2 := uuid.New()
	now := time.Now()

	mock.ExpectBegin()

	// Session ownership probe (once).
	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .* LIMIT`).
		WithArgs(uuidArg(sessionID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "user_id", "state", "created_at", "updated_at",
		}).AddRow(sessionID, ownerID, "in_progress", now, now))

	// Load session exercise ids (once).
	mock.ExpectQuery(`SELECT "session_exercises"\."id" FROM "session_exercises"`).
		WithArgs(uuidArg(sessionID)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(seID))

	// Prefetch both set logs in one query.
	mock.ExpectQuery(`SELECT \* FROM "set_logs" WHERE .*"set_logs"\."id" IN`).
		WithArgs(uuidArg(logID1), uuidArg(logID2)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state",
		}).AddRow(logID1, seID, 1, "working", "pending").
			AddRow(logID2, seID, 2, "working", "pending"))

	// Two UPDATEs, one per item.
	mock.ExpectExec(`UPDATE "set_logs" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	mock.ExpectExec(`UPDATE "set_logs" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// Reload both in one query.
	mock.ExpectQuery(`SELECT \* FROM "set_logs" WHERE .*"set_logs"\."id" IN`).
		WithArgs(uuidArg(logID1), uuidArg(logID2)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state",
		}).AddRow(logID1, seID, 1, "working", "completed").
			AddRow(logID2, seID, 2, "working", "completed"))

	// Recompute (once): session exercises, set_log states, UPDATE session.
	mock.ExpectQuery(`SELECT "session_exercises"\."id" FROM "session_exercises"`).
		WithArgs(uuidArg(sessionID)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(seID))

	mock.ExpectQuery(`SELECT "set_logs"\."state" FROM "set_logs"`).
		WithArgs(uuidArg(seID)).
		WillReturnRows(sqlmock.NewRows([]string{"state"}).
			AddRow("completed").
			AddRow("completed"))

	mock.ExpectExec(`UPDATE "sessions" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	mock.ExpectCommit()

	updates := []BatchUpdateSetLogItem{
		{SetLogID: logID1, UpdateSetLogRequest: UpdateSetLogRequest{State: ptr("completed")}},
		{SetLogID: logID2, UpdateSetLogRequest: UpdateSetLogRequest{State: ptr("completed")}},
	}
	out, err := NewRepository(db).UpdateSetLogs(context.Background(), sessionID, ownerID, updates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("want 2 rows returned, got %d", len(out))
	}
	if out[0].ID != logID1 || out[1].ID != logID2 {
		t.Errorf("returned ids: %v %v", out[0].ID, out[1].ID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryUpdateSetLogs_ForeignSetLogRollsBackAll(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	sessionID := uuid.New()
	seID := uuid.New()         // belongs to this session
	foreignSeID := uuid.New()  // belongs to a different session
	logID1 := uuid.New()
	logID2 := uuid.New()
	now := time.Now()

	mock.ExpectBegin()

	// Session ownership probe.
	mock.ExpectQuery(`SELECT \* FROM "sessions" WHERE .* LIMIT`).
		WithArgs(uuidArg(sessionID), uuidArg(ownerID), 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "user_id", "state", "created_at", "updated_at",
		}).AddRow(sessionID, ownerID, "in_progress", now, now))

	// Load session exercise ids — only seID belongs to this session.
	mock.ExpectQuery(`SELECT "session_exercises"\."id" FROM "session_exercises"`).
		WithArgs(uuidArg(sessionID)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(seID))

	// Prefetch both set logs in one query; logID2 belongs to a foreign exercise.
	mock.ExpectQuery(`SELECT \* FROM "set_logs" WHERE .*"set_logs"\."id" IN`).
		WithArgs(uuidArg(logID1), uuidArg(logID2)).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "session_exercise_id", "sequence", "set_type", "state",
		}).AddRow(logID1, seID, 1, "working", "pending").
			AddRow(logID2, foreignSeID, 1, "working", "pending"))

	// Validation rejects logID2 before any write — no UPDATEs, no reload.
	mock.ExpectRollback()

	updates := []BatchUpdateSetLogItem{
		{SetLogID: logID1, UpdateSetLogRequest: UpdateSetLogRequest{State: ptr("completed")}},
		{SetLogID: logID2, UpdateSetLogRequest: UpdateSetLogRequest{State: ptr("completed")}},
	}
	_, err := NewRepository(db).UpdateSetLogs(context.Background(), sessionID, ownerID, updates)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("want ErrRecordNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// ─── FindCompletedDays ──────────────────────────────────────────────────────

// completedDaysQuery matches the single join query: completed sessions joined
// up to program_days and program_weeks, filtered to the owner + program.
const completedDaysQuery = `SELECT .*week_sequence.*day_sequence.* FROM "sessions" .*JOIN "program_days".*JOIN "program_weeks".*GROUP BY`

func TestRepositoryFindCompletedDays_HappyPath(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	programID := uuid.New()

	mock.ExpectQuery(completedDaysQuery).
		WithArgs(uuidArg(ownerID), "completed", uuidArg(programID)).
		WillReturnRows(sqlmock.NewRows([]string{"week_sequence", "day_sequence"}).
			AddRow(4, 2))

	rows, err := NewRepository(db).FindCompletedDays(context.Background(), programID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 1 || rows[0].WeekSequence != 4 || rows[0].DaySequence != 2 {
		t.Errorf("unexpected rows: %+v", rows)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryFindCompletedDays_NoCompletedSessionsReturnsEmpty(t *testing.T) {
	db, mock := newMockDB(t)
	ownerID, programID := uuid.New(), uuid.New()

	mock.ExpectQuery(completedDaysQuery).
		WithArgs(uuidArg(ownerID), "completed", uuidArg(programID)).
		WillReturnRows(sqlmock.NewRows([]string{"week_sequence", "day_sequence"}))

	rows, err := NewRepository(db).FindCompletedDays(context.Background(), programID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rows == nil || len(rows) != 0 {
		t.Errorf("want empty non-nil slice, got %v", rows)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

// The program filter now lives in the WHERE clause (pw.program_id = $3), so
// days from other programs never come back from the DB. This asserts the
// program id is bound and the (already-deduped) rows map through in order.
func TestRepositoryFindCompletedDays_ScopesToProgramAndOrders(t *testing.T) {
	db, mock := newMockDB(t)

	ownerID := uuid.New()
	programID := uuid.New()

	mock.ExpectQuery(completedDaysQuery).
		WithArgs(uuidArg(ownerID), "completed", uuidArg(programID)).
		WillReturnRows(sqlmock.NewRows([]string{"week_sequence", "day_sequence"}).
			AddRow(1, 1).
			AddRow(1, 2).
			AddRow(2, 1))

	rows, err := NewRepository(db).FindCompletedDays(context.Background(), programID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []CompletedDayRow{{1, 1}, {1, 2}, {2, 1}}
	if len(rows) != len(want) {
		t.Fatalf("want %d rows, got %+v", len(want), rows)
	}
	for i, w := range want {
		if rows[i] != w {
			t.Errorf("row %d = %+v, want %+v", i, rows[i], w)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}
