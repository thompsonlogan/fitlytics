package coaching

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRepositoryIsLinkParticipant_GroupsTheEitherPartyOr(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`SELECT count\(\*\) FROM "coach_athletes" `+
		`WHERE "coach_athletes"\."id" = \$1 AND "coach_athletes"\."status" = \$2 `+
		`AND \("coach_athletes"\."coach_user_id" = \$3 OR "coach_athletes"\."athlete_user_id" = \$4\) `+
		`AND "coach_athletes"\."deleted_at" IS NULL`).
		WithArgs(uuidArg(linkID), StatusActive, uuidArg(coachID), uuidArg(coachID)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	ok, err := NewRepository(db).IsLinkParticipant(context.Background(), linkID, coachID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Error("want true for a participant")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the either-party OR must be parenthesised: %v", err)
	}
}

func TestRepositoryIsLinkParticipant_NoRowIsFalse(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`SELECT count\(\*\) FROM "coach_athletes"`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	ok, err := NewRepository(db).IsLinkParticipant(context.Background(), linkID, coachID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Error("want false for a non-participant")
	}
}

func TestRepositoryListLinksForUser_ScopesToActiveAndEitherParty(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`WHERE "coach_athletes"\."status" = \$1 `+
		`AND \("coach_athletes"\."coach_user_id" = \$2 OR "coach_athletes"\."athlete_user_id" = \$3\) `+
		`AND "coach_athletes"\."deleted_at" IS NULL`).
		WithArgs(StatusActive, uuidArg(coachID), uuidArg(coachID)).
		WillReturnRows(sqlmock.NewRows([]string{"link_id", "coach_user_id", "athlete_user_id", "status", "coach_name", "athlete_name"}).
			AddRow(linkID, coachID, athleteID, StatusActive, "Dana Kim", "Marcus Webb"))

	rows, err := NewRepository(db).ListLinksForUser(context.Background(), coachID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1 link, got %d", len(rows))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the either-party OR must be parenthesised: %v", err)
	}
}
