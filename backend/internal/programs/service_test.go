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

// ─── ListByOwner ────────────────────────────────────────────────────────────

func TestServiceListByOwner_PassesOwnerAndMapsRows(t *testing.T) {
	ownerID := fixedID("user:1")
	rows := []models.Program{
		{ID: fixedID("program:1"), Name: "A", CreatedAt: builtAt, UpdatedAt: builtAt},
		{ID: fixedID("program:2"), Name: "B", CreatedAt: builtAt, UpdatedAt: builtAt},
	}

	repo := &fakeRepository{
		listByOwnerFn: func(_ context.Context, _ uuid.UUID) ([]models.Program, error) {
			return rows, nil
		},
	}

	got, err := NewService(repo).ListByOwner(context.Background(), ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.listByOwnerCallCount != 1 {
		t.Errorf("repo ListByOwner calls: want 1, got %d", repo.listByOwnerCallCount)
	}
	if repo.lastListOwnerID != ownerID {
		t.Errorf("owner id passed to repo: want %v, got %v", ownerID, repo.lastListOwnerID)
	}
	if len(got) != 2 || got[0].Name != "A" || got[1].Name != "B" {
		t.Errorf("mapped rows: %+v", got)
	}
}

func TestServiceListByOwner_EmptyRowsReturnsEmptySlice(t *testing.T) {
	repo := &fakeRepository{
		listByOwnerFn: func(_ context.Context, _ uuid.UUID) ([]models.Program, error) {
			return nil, nil
		},
	}

	got, err := NewService(repo).ListByOwner(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Must be non-nil for JSON [] rendering — the API contract is "always
	// an array, never null".
	if got == nil {
		t.Fatal("returned slice must be non-nil")
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %d entries", len(got))
	}
}

func TestServiceListByOwner_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("connection refused")
	repo := &fakeRepository{
		listByOwnerFn: func(_ context.Context, _ uuid.UUID) ([]models.Program, error) {
			return nil, boom
		},
	}

	got, err := NewService(repo).ListByOwner(context.Background(), uuid.New())
	if got != nil {
		t.Errorf("expected nil slice on error, got %v", got)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
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
