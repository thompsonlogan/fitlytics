package coaching

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
)

func TestServiceRequireActiveCoach_ActiveLinkPasses(t *testing.T) {
	repo := &fakeRepository{
		isActiveCoachFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return true, nil },
	}

	if err := NewService(repo).RequireActiveCoach(context.Background(), coachID, athleteID); err != nil {
		t.Fatalf("active link should pass, got %v", err)
	}
}

func TestServiceRequireActiveCoach_NoLinkMapsToErrNotFound(t *testing.T) {
	repo := &fakeRepository{
		isActiveCoachFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, nil },
	}

	err := NewService(repo).RequireActiveCoach(context.Background(), coachID, athleteID)
	if !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("want ErrNotFound so a caller cannot distinguish 'not your athlete' from 'no such athlete', got %v", err)
	}
}

func TestServiceRequireActiveCoach_RepoErrorIsWrappedNotConvertedToDenial(t *testing.T) {
	boom := errors.New("connection refused")
	repo := &fakeRepository{
		isActiveCoachFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return false, boom },
	}

	err := NewService(repo).RequireActiveCoach(context.Background(), coachID, athleteID)
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap the underlying repo error, got %v", err)
	}
	if errors.Is(err, apierr.ErrNotFound) {
		t.Error("a database failure was incorrectly reported as 'no coaching link'")
	}
}

func TestServiceRequireActiveCoach_ErrorWinsOverTrue(t *testing.T) {
	boom := errors.New("connection reset mid-scan")
	repo := &fakeRepository{
		isActiveCoachFn: func(_ context.Context, _, _ uuid.UUID) (bool, error) { return true, boom },
	}

	err := NewService(repo).RequireActiveCoach(context.Background(), coachID, athleteID)
	if err == nil {
		t.Fatal("an errored lookup must never authorize access")
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap the underlying repo error, got %v", err)
	}
}

func TestServiceRequireActiveCoach_ThreadsBothIDsThrough(t *testing.T) {
	var gotCoach, gotAthlete uuid.UUID
	repo := &fakeRepository{
		isActiveCoachFn: func(_ context.Context, c, a uuid.UUID) (bool, error) {
			gotCoach, gotAthlete = c, a
			return true, nil
		},
	}

	_ = NewService(repo).RequireActiveCoach(context.Background(), coachID, athleteID)

	if gotCoach != coachID || gotAthlete != athleteID {
		t.Errorf("ids must reach the repo unswapped: got coach=%v athlete=%v", gotCoach, gotAthlete)
	}
}
