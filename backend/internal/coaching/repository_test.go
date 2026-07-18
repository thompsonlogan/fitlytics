package coaching

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

// The guard's WHERE clause is the whole authorization boundary, so these tests
// assert the generated SQL rather than only the Go-level behaviour: a dropped
// predicate here would silently widen access to every athlete.
const isActiveCoachQuery = `SELECT count\(\*\) FROM "coach_athletes" WHERE "coach_athletes"\."coach_user_id" = \$1 ` +
	`AND "coach_athletes"\."athlete_user_id" = \$2 AND "coach_athletes"\."status" = \$3 ` +
	`AND "coach_athletes"\."deleted_at" IS NULL`

func TestRepositoryIsActiveCoach_ScopesToCoachAthleteAndActiveStatus(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(isActiveCoachQuery).
		WithArgs(uuidArg(coachID), uuidArg(athleteID), StatusActive).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	ok, err := NewRepository(db).IsActiveCoach(context.Background(), coachID, athleteID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Error("a matching row should report an active link")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryIsActiveCoach_NoRowReportsFalse(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(isActiveCoachQuery).
		WithArgs(uuidArg(coachID), uuidArg(athleteID), StatusActive).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	ok, err := NewRepository(db).IsActiveCoach(context.Background(), coachID, athleteID)
	if err != nil {
		t.Fatalf("a confirmed absence is not an error, got %v", err)
	}
	if ok {
		t.Error("want false when no link exists")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestRepositoryIsActiveCoach_QueryErrorSurfacesAsError(t *testing.T) {
	db, mock := newMockDB(t)

	boom := errors.New("connection refused")
	mock.ExpectQuery(isActiveCoachQuery).
		WithArgs(uuidArg(coachID), uuidArg(athleteID), StatusActive).
		WillReturnError(boom)

	ok, err := NewRepository(db).IsActiveCoach(context.Background(), coachID, athleteID)
	if !errors.Is(err, boom) {
		t.Errorf("want the underlying error wrapped, got %v", err)
	}
	if ok {
		t.Error("a failed lookup must never report an active link")
	}
}

func TestRepositoryIsActiveCoach_QueriesForActiveStatusOnly(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(isActiveCoachQuery).
		WithArgs(uuidArg(coachID), uuidArg(athleteID), StatusActive).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	_, _ = NewRepository(db).IsActiveCoach(context.Background(), coachID, athleteID)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("guard should query for active links only: %v", err)
	}
}
