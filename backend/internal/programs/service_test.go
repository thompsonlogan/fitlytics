package programs

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models"
)

func TestServiceGetFullTree_HappyPath(t *testing.T) {
	repo := &fakeRepository{
		getFullTreeFn: func(_ context.Context, _, _ uuid.UUID) (*models.Program, error) {
			return fullProgram(), nil
		},
		lookupExerciseFn: func(_ context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
			// Echo the canonical names the mapper expects.
			return exerciseNames(), nil
		},
	}

	svc := NewService(repo)
	resp, err := svc.GetFullTree(context.Background(),
		fixedID("program:1"), fixedID("user:1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("response should not be nil")
	}
	if resp.ID != fixedID("program:1") {
		t.Errorf("ID: want program:1 fixture, got %v", resp.ID)
	}

	// Sanity: service should have called the repo exactly once each.
	if repo.getFullTreeCallCount != 1 {
		t.Errorf("GetFullTree calls: want 1, got %d", repo.getFullTreeCallCount)
	}
	if repo.lookupCalledCount != 1 {
		t.Errorf("LookupExerciseNames calls: want 1, got %d", repo.lookupCalledCount)
	}

	// And it should have asked for exactly the distinct exercise ids — the
	// dedup is part of the service contract.
	if len(repo.lastLookupIDs) != 2 {
		t.Errorf("distinct exercise ids: want 2, got %d (%v)",
			len(repo.lastLookupIDs), repo.lastLookupIDs)
	}
}

func TestServiceGetFullTree_NotFoundMapsToErrNotFound(t *testing.T) {
	repo := &fakeRepository{
		getFullTreeFn: func(_ context.Context, _, _ uuid.UUID) (*models.Program, error) {
			return nil, gorm.ErrRecordNotFound
		},
	}

	resp, err := NewService(repo).GetFullTree(context.Background(),
		uuid.New(), uuid.New())

	if resp != nil {
		t.Errorf("response should be nil on not-found, got %+v", resp)
	}
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("error: want ErrNotFound, got %v", err)
	}
	// Should not have attempted the exercise lookup once the program is gone.
	if repo.lookupCalledCount != 0 {
		t.Errorf("LookupExerciseNames should not be called when program is missing, got %d", repo.lookupCalledCount)
	}
}

func TestServiceGetFullTree_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("connection refused")
	repo := &fakeRepository{
		getFullTreeFn: func(_ context.Context, _, _ uuid.UUID) (*models.Program, error) {
			return nil, boom
		},
	}

	resp, err := NewService(repo).GetFullTree(context.Background(),
		uuid.New(), uuid.New())

	if resp != nil {
		t.Errorf("response should be nil on error, got %+v", resp)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
	}
	// Wrapping should not collapse to ErrNotFound.
	if errors.Is(err, ErrNotFound) {
		t.Error("generic repo error was incorrectly mapped to ErrNotFound")
	}
}

func TestServiceGetFullTree_NameLookupErrorIsWrapped(t *testing.T) {
	boom := errors.New("exercise table unavailable")
	repo := &fakeRepository{
		getFullTreeFn: func(_ context.Context, _, _ uuid.UUID) (*models.Program, error) {
			return fullProgram(), nil
		},
		lookupExerciseFn: func(_ context.Context, _ []uuid.UUID) (map[uuid.UUID]string, error) {
			return nil, boom
		},
	}

	resp, err := NewService(repo).GetFullTree(context.Background(),
		uuid.New(), uuid.New())

	if resp != nil {
		t.Errorf("response should be nil when name lookup fails, got %+v", resp)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying lookup error; got %v", err)
	}
}
