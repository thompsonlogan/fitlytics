package programs

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func TestServiceGetProgramById_HappyPath(t *testing.T) {
	repo := &fakeRepository{
		getProgramByIdFn: func(_ context.Context, _, _ uuid.UUID) (*generated.Program, error) {
			return fullProgram(), nil
		},
		getExercisesByIdsFn: func(_ context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
			return exerciseNames(), nil
		},
	}

	svc := NewService(repo)
	resp, err := svc.GetProgramById(context.Background(),
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
	if repo.getProgramByIdCount != 1 {
		t.Errorf("GetProgramById calls: want 1, got %d", repo.getProgramByIdCount)
	}
	if repo.getExercisesByIdsCount != 1 {
		t.Errorf("GetExercisesByIds calls: want 1, got %d", repo.getExercisesByIdsCount)
	}
	if len(repo.lastLookupIDs) != 2 {
		t.Errorf("distinct exercise ids: want 2, got %d (%v)",
			len(repo.lastLookupIDs), repo.lastLookupIDs)
	}
}

func TestServiceGetProgramById_NotFoundMapsToErrNotFound(t *testing.T) {
	repo := &fakeRepository{
		getProgramByIdFn: func(_ context.Context, _, _ uuid.UUID) (*generated.Program, error) {
			return nil, gorm.ErrRecordNotFound
		},
	}

	resp, err := NewService(repo).GetProgramById(context.Background(),
		uuid.New(), uuid.New())

	if resp != nil {
		t.Errorf("response should be nil on not-found, got %+v", resp)
	}
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("error: want ErrNotFound, got %v", err)
	}
	if repo.getExercisesByIdsCount != 0 {
		t.Errorf("GetExercisesByIds should not be called when program is missing, got %d", repo.getExercisesByIdsCount)
	}
}

func TestServiceGetProgramById_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("connection refused")
	repo := &fakeRepository{
		getProgramByIdFn: func(_ context.Context, _, _ uuid.UUID) (*generated.Program, error) {
			return nil, boom
		},
	}

	resp, err := NewService(repo).GetProgramById(context.Background(),
		uuid.New(), uuid.New())

	if resp != nil {
		t.Errorf("response should be nil on error, got %+v", resp)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
	}
	if errors.Is(err, ErrNotFound) {
		t.Error("generic repo error was incorrectly mapped to ErrNotFound")
	}
}

// ─── GetProgramsByUserId ────────────────────────────────────────────────────

func TestServiceGetProgramsByUserId_PassesOwnerAndMapsRows(t *testing.T) {
	ownerID := fixedID("user:1")
	rows := []generated.Program{
		{ID: fixedID("program:1"), Name: "A", CreatedAt: builtAt, UpdatedAt: builtAt},
		{ID: fixedID("program:2"), Name: "B", CreatedAt: builtAt, UpdatedAt: builtAt},
	}

	repo := &fakeRepository{
		getProgramsByUserIdFn: func(_ context.Context, _ uuid.UUID) ([]generated.Program, error) {
			return rows, nil
		},
	}

	got, err := NewService(repo).GetProgramsByUserId(context.Background(), ownerID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.getProgramsByUserIdCount != 1 {
		t.Errorf("repo GetProgramsByUserId calls: want 1, got %d", repo.getProgramsByUserIdCount)
	}
	if repo.lastListOwnerID != ownerID {
		t.Errorf("owner id passed to repo: want %v, got %v", ownerID, repo.lastListOwnerID)
	}
	if len(got) != 2 || got[0].Name != "A" || got[1].Name != "B" {
		t.Errorf("mapped rows: %+v", got)
	}
}

func TestServiceGetProgramsByUserId_EmptyRowsReturnsEmptySlice(t *testing.T) {
	repo := &fakeRepository{
		getProgramsByUserIdFn: func(_ context.Context, _ uuid.UUID) ([]generated.Program, error) {
			return nil, nil
		},
	}

	got, err := NewService(repo).GetProgramsByUserId(context.Background(), uuid.New())
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

func TestServiceGetProgramsByUserId_RepoErrorIsWrapped(t *testing.T) {
	boom := errors.New("connection refused")
	repo := &fakeRepository{
		getProgramsByUserIdFn: func(_ context.Context, _ uuid.UUID) ([]generated.Program, error) {
			return nil, boom
		},
	}

	got, err := NewService(repo).GetProgramsByUserId(context.Background(), uuid.New())
	if got != nil {
		t.Errorf("expected nil slice on error, got %v", got)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying repo error; got %v", err)
	}
}

func TestServiceGetProgramById_NameLookupErrorIsWrapped(t *testing.T) {
	boom := errors.New("exercise table unavailable")
	repo := &fakeRepository{
		getProgramByIdFn: func(_ context.Context, _, _ uuid.UUID) (*generated.Program, error) {
			return fullProgram(), nil
		},
		getExercisesByIdsFn: func(_ context.Context, _ []uuid.UUID) (map[uuid.UUID]string, error) {
			return nil, boom
		},
	}

	resp, err := NewService(repo).GetProgramById(context.Background(),
		uuid.New(), uuid.New())

	if resp != nil {
		t.Errorf("response should be nil when name lookup fails, got %+v", resp)
	}
	if !errors.Is(err, boom) {
		t.Errorf("error should wrap underlying lookup error; got %v", err)
	}
}
