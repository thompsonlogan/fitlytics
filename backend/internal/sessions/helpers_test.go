package sessions

import (
	"context"

	"github.com/google/uuid"
)

// ptr returns a pointer to the given value — handy in tests when building
// pointer-typed DTO fields.
func ptr[T any](v T) *T { return &v }

// fakeService implements Service for handler tests with caller-supplied
// closures. Methods return zero values when the closure is nil, which is
// fine for tests that exercise one method at a time.
type fakeService struct {
	findCurrentFn        func(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	ensureForDayFn       func(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	updateSetLogFn       func(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error)
	listCompletedDaysFn  func(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error)
}

func (f *fakeService) FindCurrent(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	if f.findCurrentFn == nil {
		return nil, ErrNotFound
	}
	return f.findCurrentFn(ctx, programDayID, ownerUserID)
}

func (f *fakeService) EnsureForDay(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	if f.ensureForDayFn == nil {
		return nil, nil
	}
	return f.ensureForDayFn(ctx, programID, programDayID, ownerUserID)
}

func (f *fakeService) UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error) {
	if f.updateSetLogFn == nil {
		return nil, nil
	}
	return f.updateSetLogFn(ctx, sessionID, setLogID, ownerUserID, input)
}

func (f *fakeService) ListCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error) {
	if f.listCompletedDaysFn == nil {
		return []CompletedDayResponse{}, nil
	}
	return f.listCompletedDaysFn(ctx, programID, ownerUserID)
}
