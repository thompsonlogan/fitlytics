package sessions

import (
	"context"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func ptr[T any](v T) *T { return &v }

type fakeService struct {
	findCurrentFn        func(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	ensureForDayFn       func(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	updateSetLogFn       func(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error)
	listCompletedDaysFn  func(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error)
}

func (f *fakeService) GetCurrentSession(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	if f.findCurrentFn == nil {
		return nil, ErrNotFound
	}
	return f.findCurrentFn(ctx, programDayID, ownerUserID)
}

func (f *fakeService) StartSession(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
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

func (f *fakeService) GetCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error) {
	if f.listCompletedDaysFn == nil {
		return []CompletedDayResponse{}, nil
	}
	return f.listCompletedDaysFn(ctx, programID, ownerUserID)
}

// ─── fakeRepository ──────────────────────────────────────────────────────────

type fakeRepository struct {
	getCurrentFn       func(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*generated.Session, error)
	startFn            func(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*generated.Session, error)
	updateSetLogFn     func(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*generated.SetLog, error)
	findCompletedFn    func(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayRow, error)

	getCurrentCount    int
	startCount         int
	updateSetLogCount  int
	findCompletedCount int

	lastInput UpdateSetLogRequest
}

func (f *fakeRepository) GetCurrentSessionByDay(ctx context.Context, programDayID, ownerUserID uuid.UUID) (*generated.Session, error) {
	f.getCurrentCount++
	if f.getCurrentFn == nil {
		return nil, nil
	}
	return f.getCurrentFn(ctx, programDayID, ownerUserID)
}

func (f *fakeRepository) StartSessionForDay(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*generated.Session, error) {
	f.startCount++
	if f.startFn == nil {
		return nil, nil
	}
	return f.startFn(ctx, programID, programDayID, ownerUserID)
}

func (f *fakeRepository) UpdateSetLog(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*generated.SetLog, error) {
	f.updateSetLogCount++
	f.lastInput = input
	if f.updateSetLogFn == nil {
		return nil, nil
	}
	return f.updateSetLogFn(ctx, sessionID, setLogID, ownerUserID, input)
}

func (f *fakeRepository) FindCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayRow, error) {
	f.findCompletedCount++
	if f.findCompletedFn == nil {
		return nil, nil
	}
	return f.findCompletedFn(ctx, programID, ownerUserID)
}
