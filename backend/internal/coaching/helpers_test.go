package coaching

import (
	"context"
	"database/sql/driver"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
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
	isActiveCoachFn      func(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error)
	listActiveAthletesFn func(ctx context.Context, coachID uuid.UUID) ([]RosterAthlete, error)
	latestProgramFn      func(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]RosterProgram, error)
	schedulesFn          func(ctx context.Context, programIDs []uuid.UUID) (map[uuid.UUID][]ScheduledDay, error)
	metricsFn            func(ctx context.Context, userIDs []uuid.UUID, since time.Time) (map[uuid.UUID]RosterMetrics, error)
	videosFn             func(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]int64, error)

	isLinkParticipantFn func(ctx context.Context, linkID, userID uuid.UUID) (bool, error)
	getLinkFn           func(ctx context.Context, linkID uuid.UUID) (*generated.CoachAthlete, error)
	listLinksFn         func(ctx context.Context, userID uuid.UUID) ([]Link, error)
	listNotesFn         func(ctx context.Context, linkID uuid.UUID) ([]NoteWithAuthor, error)
	createNoteFn        func(ctx context.Context, note *generated.CoachNote) (*NoteWithAuthor, error)
	videoBelongsToFn    func(ctx context.Context, videoID, userID uuid.UUID) (bool, error)

	createdNote      *generated.CoachNote
	videoOwnerChecks int

	lastSince     time.Time
	lastIDs       []uuid.UUID
	scheduleCalls int
	programCalls  int
	metricsCalls  int
	videoCalls    int
}

// ── notes thread ────────────────────────────────────────────────────────────

func (f *fakeRepository) IsLinkParticipant(ctx context.Context, linkID, userID uuid.UUID) (bool, error) {
	if f.isLinkParticipantFn == nil {
		return true, nil
	}
	return f.isLinkParticipantFn(ctx, linkID, userID)
}

func (f *fakeRepository) GetLink(ctx context.Context, linkID uuid.UUID) (*generated.CoachAthlete, error) {
	if f.getLinkFn == nil {
		return &generated.CoachAthlete{ID: linkID, CoachUserID: coachID, AthleteUserID: athleteID}, nil
	}
	return f.getLinkFn(ctx, linkID)
}

func (f *fakeRepository) ListLinksForUser(ctx context.Context, userID uuid.UUID) ([]Link, error) {
	if f.listLinksFn == nil {
		return nil, nil
	}
	return f.listLinksFn(ctx, userID)
}

func (f *fakeRepository) ListNotes(ctx context.Context, linkID uuid.UUID) ([]NoteWithAuthor, error) {
	if f.listNotesFn == nil {
		return nil, nil
	}
	return f.listNotesFn(ctx, linkID)
}

func (f *fakeRepository) CreateNote(ctx context.Context, note *generated.CoachNote) (*NoteWithAuthor, error) {
	f.createdNote = note
	if f.createNoteFn == nil {
		return &NoteWithAuthor{Note: *note, AuthorName: "Dana Kim"}, nil
	}
	return f.createNoteFn(ctx, note)
}

func (f *fakeRepository) VideoBelongsTo(ctx context.Context, videoID, userID uuid.UUID) (bool, error) {
	f.videoOwnerChecks++
	if f.videoBelongsToFn == nil {
		return true, nil
	}
	return f.videoBelongsToFn(ctx, videoID, userID)
}

func (f *fakeRepository) IsActiveCoach(ctx context.Context, coachID, athleteID uuid.UUID) (bool, error) {
	if f.isActiveCoachFn == nil {
		return true, nil
	}
	return f.isActiveCoachFn(ctx, coachID, athleteID)
}

func (f *fakeRepository) ListActiveAthletes(ctx context.Context, coachID uuid.UUID) ([]RosterAthlete, error) {
	if f.listActiveAthletesFn == nil {
		return nil, nil
	}
	return f.listActiveAthletesFn(ctx, coachID)
}

func (f *fakeRepository) LatestProgramByUser(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]RosterProgram, error) {
	f.programCalls++
	f.lastIDs = userIDs
	if f.latestProgramFn == nil {
		return map[uuid.UUID]RosterProgram{}, nil
	}
	return f.latestProgramFn(ctx, userIDs)
}

func (f *fakeRepository) ScheduledDaysByProgram(ctx context.Context, programIDs []uuid.UUID) (map[uuid.UUID][]ScheduledDay, error) {
	f.scheduleCalls++
	if f.schedulesFn == nil {
		return map[uuid.UUID][]ScheduledDay{}, nil
	}
	return f.schedulesFn(ctx, programIDs)
}

func (f *fakeRepository) MetricsByUser(ctx context.Context, userIDs []uuid.UUID, since time.Time) (map[uuid.UUID]RosterMetrics, error) {
	f.metricsCalls++
	f.lastSince = since
	if f.metricsFn == nil {
		return map[uuid.UUID]RosterMetrics{}, nil
	}
	return f.metricsFn(ctx, userIDs, since)
}

func (f *fakeRepository) UnreviewedVideoCountByUser(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]int64, error) {
	f.videoCalls++
	if f.videosFn == nil {
		return map[uuid.UUID]int64{}, nil
	}
	return f.videosFn(ctx, userIDs)
}
