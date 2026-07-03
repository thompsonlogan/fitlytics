package sessions

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

// ─── GetCurrentSession ──────────────────────────────────────────────────────

func TestServiceGetCurrentSession_HappyPathMapsRow(t *testing.T) {
	sessionID := uuid.New()
	var gotProgramID, gotDayID, gotOwnerID uuid.UUID
	repo := &fakeRepository{
		getCurrentFn: func(_ context.Context, programID, dayID, ownerID uuid.UUID) (*generated.Session, error) {
			gotProgramID, gotDayID, gotOwnerID = programID, dayID, ownerID
			return &generated.Session{ID: sessionID, State: "in_progress"}, nil
		},
	}

	programID, dayID, ownerID := uuid.New(), uuid.New(), uuid.New()
	resp, err := NewService(repo).GetCurrentSession(context.Background(), programID, dayID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil || resp.ID != sessionID || resp.State != "in_progress" {
		t.Errorf("unexpected response: %+v", resp)
	}
	if gotProgramID != programID || gotDayID != dayID || gotOwnerID != ownerID {
		t.Errorf("ids passed to repo: program=%v day=%v owner=%v", gotProgramID, gotDayID, gotOwnerID)
	}
}

func TestServiceGetCurrentSession_NotFoundMapsToErrNotFound(t *testing.T) {
	repo := &fakeRepository{
		getCurrentFn: func(_ context.Context, _, _, _ uuid.UUID) (*generated.Session, error) {
			return nil, gorm.ErrRecordNotFound
		},
	}

	resp, err := NewService(repo).GetCurrentSession(context.Background(), uuid.New(), uuid.New(), uuid.New())
	if resp != nil {
		t.Errorf("response should be nil on not-found, got %+v", resp)
	}
	if !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("error: want ErrNotFound, got %v", err)
	}
}

func TestServiceGetCurrentSession_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("connection refused")
	repo := &fakeRepository{
		getCurrentFn: func(_ context.Context, _, _, _ uuid.UUID) (*generated.Session, error) {
			return nil, boom
		},
	}

	resp, err := NewService(repo).GetCurrentSession(context.Background(), uuid.New(), uuid.New(), uuid.New())
	if resp != nil {
		t.Errorf("response should be nil on error, got %+v", resp)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
	}
	if errors.Is(err, apierr.ErrNotFound) {
		t.Error("generic repo error was incorrectly mapped to ErrNotFound")
	}
}

// ─── StartSession ───────────────────────────────────────────────────────────

func TestServiceStartSession_HappyPathMapsRow(t *testing.T) {
	sessionID := uuid.New()
	var gotProgramID, gotDayID, gotOwnerID uuid.UUID
	repo := &fakeRepository{
		startFn: func(_ context.Context, programID, dayID, ownerID uuid.UUID) (*generated.Session, error) {
			gotProgramID, gotDayID, gotOwnerID = programID, dayID, ownerID
			return &generated.Session{ID: sessionID, State: "in_progress"}, nil
		},
	}

	programID, dayID, ownerID := uuid.New(), uuid.New(), uuid.New()
	resp, err := NewService(repo).StartSession(context.Background(), programID, dayID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil || resp.ID != sessionID {
		t.Errorf("unexpected response: %+v", resp)
	}
	if gotProgramID != programID || gotDayID != dayID || gotOwnerID != ownerID {
		t.Errorf("ids passed to repo: prog=%v day=%v owner=%v", gotProgramID, gotDayID, gotOwnerID)
	}
}

func TestServiceStartSession_NotFoundMapsToErrNotFound(t *testing.T) {
	repo := &fakeRepository{
		startFn: func(_ context.Context, _, _, _ uuid.UUID) (*generated.Session, error) {
			return nil, gorm.ErrRecordNotFound
		},
	}

	resp, err := NewService(repo).StartSession(context.Background(), uuid.New(), uuid.New(), uuid.New())
	if resp != nil {
		t.Errorf("response should be nil on not-found, got %+v", resp)
	}
	if !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("error: want ErrNotFound, got %v", err)
	}
}

func TestServiceStartSession_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("deadlock detected")
	repo := &fakeRepository{
		startFn: func(_ context.Context, _, _, _ uuid.UUID) (*generated.Session, error) {
			return nil, boom
		},
	}

	resp, err := NewService(repo).StartSession(context.Background(), uuid.New(), uuid.New(), uuid.New())
	if resp != nil {
		t.Errorf("response should be nil on error, got %+v", resp)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
	}
}

// ─── UpdateSetLog: validation ───────────────────────────────────────────────

func TestServiceUpdateSetLog_RejectsOutOfRangeValues(t *testing.T) {
	cases := []struct {
		name  string
		input UpdateSetLogRequest
	}{
		{"reps below min", UpdateSetLogRequest{RepsActual: ptr(int32(minReps - 1))}},
		{"reps above max", UpdateSetLogRequest{RepsActual: ptr(int32(maxReps + 1))}},
		{"load below min", UpdateSetLogRequest{ActualLoadKg: ptr(minLoadKg - 1)}},
		{"load above max", UpdateSetLogRequest{ActualLoadKg: ptr(maxLoadKg + 1)}},
		{"rpe below min", UpdateSetLogRequest{ActualRpe: ptr(minRpe - 1)}},
		{"rpe above max", UpdateSetLogRequest{ActualRpe: ptr(maxRpe + 1)}},
		{"unknown state", UpdateSetLogRequest{State: ptr("bogus")}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeRepository{}
			resp, err := NewService(repo).UpdateSetLog(
				context.Background(), uuid.New(), uuid.New(), uuid.New(), tc.input)

			if resp != nil {
				t.Errorf("response should be nil on invalid input, got %+v", resp)
			}
			if !errors.Is(err, apierr.ErrInvalidInput) {
				t.Errorf("error: want ErrInvalidInput, got %v", err)
			}
			// Validation must short-circuit before touching the repository.
			if repo.updateSetLogCount != 0 {
				t.Errorf("repo should not be called on invalid input, got %d calls", repo.updateSetLogCount)
			}
		})
	}
}

func TestServiceUpdateSetLog_AcceptsBoundaryAndKnownStates(t *testing.T) {
	cases := []UpdateSetLogRequest{
		{RepsActual: ptr(int32(minReps))},
		{RepsActual: ptr(int32(maxReps))},
		{ActualLoadKg: ptr(minLoadKg)},
		{ActualLoadKg: ptr(maxLoadKg)},
		{ActualRpe: ptr(minRpe)},
		{ActualRpe: ptr(maxRpe)},
		{State: ptr("pending")},
		{State: ptr("completed")},
		{State: ptr("skipped")},
	}

	for _, in := range cases {
		repo := &fakeRepository{
			updateSetLogFn: func(_ context.Context, _, slid, _ uuid.UUID, _ UpdateSetLogRequest) (*generated.SetLog, error) {
				return &generated.SetLog{ID: slid}, nil
			},
		}
		_, err := NewService(repo).UpdateSetLog(
			context.Background(), uuid.New(), uuid.New(), uuid.New(), in)
		if err != nil {
			t.Errorf("input %+v should be accepted, got error %v", in, err)
		}
		if repo.updateSetLogCount != 1 {
			t.Errorf("input %+v: repo should be called once, got %d", in, repo.updateSetLogCount)
		}
	}
}

// ─── UpdateSetLog: delegation + error mapping ───────────────────────────────

func TestServiceUpdateSetLog_HappyPathThreadsInputAndMapsRow(t *testing.T) {
	setLogID := uuid.New()
	var (
		gotSessionID, gotSetLogID, gotOwnerID uuid.UUID
		gotInput                              UpdateSetLogRequest
	)
	repo := &fakeRepository{
		updateSetLogFn: func(_ context.Context, sid, slid, oid uuid.UUID, in UpdateSetLogRequest) (*generated.SetLog, error) {
			gotSessionID, gotSetLogID, gotOwnerID = sid, slid, oid
			gotInput = in
			return &generated.SetLog{
				ID:           slid,
				Sequence:     1,
				SetType:      "working",
				ActualLoadKg: ptr(130.0),
				ActualRpe:    ptr(8.5),
				State:        "completed",
			}, nil
		},
	}

	sessionID, ownerID := uuid.New(), uuid.New()
	input := UpdateSetLogRequest{ActualLoadKg: ptr(130.0), ActualRpe: ptr(8.5), State: ptr("completed")}

	resp, err := NewService(repo).UpdateSetLog(context.Background(), sessionID, setLogID, ownerID, input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotSessionID != sessionID || gotSetLogID != setLogID || gotOwnerID != ownerID {
		t.Errorf("ids: session=%v setLog=%v owner=%v", gotSessionID, gotSetLogID, gotOwnerID)
	}
	if gotInput.State == nil || *gotInput.State != "completed" {
		t.Errorf("input not threaded through: %+v", gotInput)
	}
	if resp == nil || resp.ID != setLogID || resp.State != "completed" {
		t.Errorf("mapped response: %+v", resp)
	}
	if resp.ActualLoadKg == nil || *resp.ActualLoadKg != 130.0 {
		t.Errorf("actual load not mapped: %+v", resp)
	}
}

func TestServiceUpdateSetLog_NotFoundMapsToErrNotFound(t *testing.T) {
	repo := &fakeRepository{
		updateSetLogFn: func(_ context.Context, _, _, _ uuid.UUID, _ UpdateSetLogRequest) (*generated.SetLog, error) {
			return nil, gorm.ErrRecordNotFound
		},
	}

	resp, err := NewService(repo).UpdateSetLog(
		context.Background(), uuid.New(), uuid.New(), uuid.New(), UpdateSetLogRequest{State: ptr("completed")})
	if resp != nil {
		t.Errorf("response should be nil on not-found, got %+v", resp)
	}
	if !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("error: want ErrNotFound, got %v", err)
	}
}

func TestServiceUpdateSetLog_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("constraint violation")
	repo := &fakeRepository{
		updateSetLogFn: func(_ context.Context, _, _, _ uuid.UUID, _ UpdateSetLogRequest) (*generated.SetLog, error) {
			return nil, boom
		},
	}

	resp, err := NewService(repo).UpdateSetLog(
		context.Background(), uuid.New(), uuid.New(), uuid.New(), UpdateSetLogRequest{State: ptr("completed")})
	if resp != nil {
		t.Errorf("response should be nil on error, got %+v", resp)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
	}
	if errors.Is(err, apierr.ErrNotFound) {
		t.Error("generic repo error was incorrectly mapped to ErrNotFound")
	}
}

// ─── GetCompletedDays ───────────────────────────────────────────────────────

func TestServiceGetCompletedDays_MapsRows(t *testing.T) {
	var gotProgramID, gotOwnerID uuid.UUID
	repo := &fakeRepository{
		findCompletedFn: func(_ context.Context, programID, ownerID uuid.UUID) ([]CompletedDayRow, error) {
			gotProgramID, gotOwnerID = programID, ownerID
			return []CompletedDayRow{
				{WeekSequence: 1, DaySequence: 1},
				{WeekSequence: 2, DaySequence: 3},
			}, nil
		},
	}

	programID, ownerID := uuid.New(), uuid.New()
	got, err := NewService(repo).GetCompletedDays(context.Background(), programID, ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotProgramID != programID || gotOwnerID != ownerID {
		t.Errorf("ids passed to repo: program=%v owner=%v", gotProgramID, gotOwnerID)
	}
	if len(got) != 2 || got[0].WeekSequence != 1 || got[1].DaySequence != 3 {
		t.Errorf("mapped rows: %+v", got)
	}
}

func TestServiceGetCompletedDays_EmptyRowsReturnsEmptySlice(t *testing.T) {
	repo := &fakeRepository{
		findCompletedFn: func(_ context.Context, _, _ uuid.UUID) ([]CompletedDayRow, error) {
			return nil, nil
		},
	}

	got, err := NewService(repo).GetCompletedDays(context.Background(), uuid.New(), uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil {
		t.Fatal("returned slice must be non-nil")
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %d entries", len(got))
	}
}

func TestServiceGetCompletedDays_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("connection refused")
	repo := &fakeRepository{
		findCompletedFn: func(_ context.Context, _, _ uuid.UUID) ([]CompletedDayRow, error) {
			return nil, boom
		},
	}

	got, err := NewService(repo).GetCompletedDays(context.Background(), uuid.New(), uuid.New())
	if got != nil {
		t.Errorf("expected nil slice on error, got %v", got)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
	}
}

// ─── UpdateSession ─────────────────────────────────────────────────────────

func TestServiceUpdateSession_ThreadsNotesAndMapsRow(t *testing.T) {
	sessionID, ownerID := uuid.New(), uuid.New()
	var (
		gotSessionID, gotOwnerID uuid.UUID
		gotNotes                 *string
	)
	repo := &fakeRepository{
		updateNotesFn: func(_ context.Context, sid, oid uuid.UUID, notes *string) (*generated.Session, error) {
			gotSessionID, gotOwnerID, gotNotes = sid, oid, notes
			return &generated.Session{ID: sid, UserID: oid, State: "in_progress", Notes: notes}, nil
		},
	}

	resp, err := NewService(repo).UpdateSession(
		context.Background(), sessionID, ownerID, UpdateSessionRequest{Notes: ptr("bar speed good")})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotSessionID != sessionID || gotOwnerID != ownerID {
		t.Errorf("ids: session=%v owner=%v", gotSessionID, gotOwnerID)
	}
	if gotNotes == nil || *gotNotes != "bar speed good" {
		t.Errorf("notes not threaded through: %v", gotNotes)
	}
	if resp == nil || resp.ID != sessionID || resp.Notes == nil || *resp.Notes != "bar speed good" {
		t.Errorf("mapped response: %+v", resp)
	}
}

func TestServiceUpdateSession_ClearNotePassesNilPointer(t *testing.T) {
	var (
		gotNotes  *string
		notesSeen bool
	)
	repo := &fakeRepository{
		updateNotesFn: func(_ context.Context, sid, oid uuid.UUID, notes *string) (*generated.Session, error) {
			gotNotes, notesSeen = notes, true
			return &generated.Session{ID: sid, UserID: oid, State: "planned", Notes: notes}, nil
		},
	}

	_, err := NewService(repo).UpdateSession(
		context.Background(), uuid.New(), uuid.New(), UpdateSessionRequest{Notes: nil})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !notesSeen {
		t.Fatal("repo was not called")
	}
	if gotNotes != nil {
		t.Errorf("nil note should pass a nil pointer (SQL NULL), got %v", *gotNotes)
	}
}

func TestServiceUpdateSession_RejectsOverlongNote(t *testing.T) {
	repo := &fakeRepository{
		updateNotesFn: func(context.Context, uuid.UUID, uuid.UUID, *string) (*generated.Session, error) {
			t.Fatal("repository should not be called for invalid note")
			return nil, nil
		},
	}

	resp, err := NewService(repo).UpdateSession(
		context.Background(), uuid.New(), uuid.New(), UpdateSessionRequest{Notes: ptr(repeatRune('n', maxSessionNoteChars+1))})
	if resp != nil {
		t.Errorf("response should be nil on invalid input, got %+v", resp)
	}
	if !errors.Is(err, apierr.ErrInvalidInput) {
		t.Errorf("error: want ErrInvalidInput, got %v", err)
	}
}

func TestServiceUpdateSession_AcceptsBoundaryNote(t *testing.T) {
	note := repeatRune('n', maxSessionNoteChars)
	repo := &fakeRepository{
		updateNotesFn: func(_ context.Context, sid, oid uuid.UUID, got *string) (*generated.Session, error) {
			if got == nil || *got != note {
				t.Fatalf("note passed to repo: %v", got)
			}
			return &generated.Session{ID: sid, UserID: oid, State: "planned", Notes: got}, nil
		},
	}

	resp, err := NewService(repo).UpdateSession(
		context.Background(), uuid.New(), uuid.New(), UpdateSessionRequest{Notes: &note})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Notes == nil || *resp.Notes != note {
		t.Fatalf("response note mismatch: %+v", resp.Notes)
	}
}

func TestServiceUpdateSession_NotFoundMapsToErrNotFound(t *testing.T) {
	repo := &fakeRepository{
		updateNotesFn: func(_ context.Context, _, _ uuid.UUID, _ *string) (*generated.Session, error) {
			return nil, gorm.ErrRecordNotFound
		},
	}

	resp, err := NewService(repo).UpdateSession(
		context.Background(), uuid.New(), uuid.New(), UpdateSessionRequest{Notes: ptr("hi")})
	if resp != nil {
		t.Errorf("response should be nil on not-found, got %+v", resp)
	}
	if !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("error: want ErrNotFound, got %v", err)
	}
}

func TestServiceUpdateSession_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("connection refused")
	repo := &fakeRepository{
		updateNotesFn: func(_ context.Context, _, _ uuid.UUID, _ *string) (*generated.Session, error) {
			return nil, boom
		},
	}

	resp, err := NewService(repo).UpdateSession(
		context.Background(), uuid.New(), uuid.New(), UpdateSessionRequest{Notes: ptr("hi")})
	if resp != nil {
		t.Errorf("response should be nil on error, got %+v", resp)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
	}
	if errors.Is(err, apierr.ErrNotFound) {
		t.Error("generic repo error was incorrectly mapped to ErrNotFound")
	}
}
