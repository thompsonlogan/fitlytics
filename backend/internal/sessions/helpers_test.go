package sessions

import (
	"context"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func ptr[T any](v T) *T { return &v }

func repeatRune(r rune, n int) string {
	out := make([]rune, n)
	for i := range out {
		out[i] = r
	}
	return string(out)
}

type fakeService struct {
	findCurrentFn       func(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	ensureForDayFn      func(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error)
	updateSetLogFn      func(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*SetLogResponse, error)
	updateSetLogsFn     func(ctx context.Context, sessionID, ownerUserID uuid.UUID, input BatchUpdateSetLogsRequest) ([]SetLogResponse, error)
	listCompletedDaysFn func(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error)
	updateSessionFn     func(ctx context.Context, sessionID, ownerUserID uuid.UUID, input UpdateSessionRequest) (*SessionResponse, error)
}

func (f *fakeService) GetCurrentSession(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*SessionResponse, error) {
	if f.findCurrentFn == nil {
		return nil, apierr.ErrNotFound
	}
	return f.findCurrentFn(ctx, programID, programDayID, ownerUserID)
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

func (f *fakeService) UpdateSetLogs(ctx context.Context, sessionID, ownerUserID uuid.UUID, input BatchUpdateSetLogsRequest) ([]SetLogResponse, error) {
	if f.updateSetLogsFn == nil {
		return nil, nil
	}
	return f.updateSetLogsFn(ctx, sessionID, ownerUserID, input)
}

func (f *fakeService) GetCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayResponse, error) {
	if f.listCompletedDaysFn == nil {
		return []CompletedDayResponse{}, nil
	}
	return f.listCompletedDaysFn(ctx, programID, ownerUserID)
}

func (f *fakeService) UpdateSession(ctx context.Context, sessionID, ownerUserID uuid.UUID, input UpdateSessionRequest) (*SessionResponse, error) {
	if f.updateSessionFn == nil {
		return nil, nil
	}
	return f.updateSessionFn(ctx, sessionID, ownerUserID, input)
}

// ─── fakeRepository ──────────────────────────────────────────────────────────

type fakeRepository struct {
	getCurrentFn    func(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*generated.Session, error)
	startFn         func(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*generated.Session, error)
	updateSetLogFn  func(ctx context.Context, sessionID, setLogID, ownerUserID uuid.UUID, input UpdateSetLogRequest) (*generated.SetLog, error)
	updateSetLogsFn func(ctx context.Context, sessionID, ownerUserID uuid.UUID, updates []BatchUpdateSetLogItem) ([]*generated.SetLog, error)
	findCompletedFn func(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayRow, error)
	updateNotesFn   func(ctx context.Context, sessionID, ownerUserID uuid.UUID, notes *string) (*generated.Session, error)

	getCurrentCount    int
	startCount         int
	updateSetLogCount  int
	updateSetLogsCount int
	findCompletedCount int
	updateNotesCount   int

	lastInput     UpdateSetLogRequest
	lastNotes     *string
	lastNotesSeen bool
}

func (f *fakeRepository) GetCurrentSessionByDay(ctx context.Context, programID, programDayID, ownerUserID uuid.UUID) (*generated.Session, error) {
	f.getCurrentCount++
	if f.getCurrentFn == nil {
		return nil, nil
	}
	return f.getCurrentFn(ctx, programID, programDayID, ownerUserID)
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

func (f *fakeRepository) UpdateSetLogs(ctx context.Context, sessionID, ownerUserID uuid.UUID, updates []BatchUpdateSetLogItem) ([]*generated.SetLog, error) {
	f.updateSetLogsCount++
	if f.updateSetLogsFn == nil {
		return nil, nil
	}
	return f.updateSetLogsFn(ctx, sessionID, ownerUserID, updates)
}

func (f *fakeRepository) FindCompletedDays(ctx context.Context, programID, ownerUserID uuid.UUID) ([]CompletedDayRow, error) {
	f.findCompletedCount++
	if f.findCompletedFn == nil {
		return nil, nil
	}
	return f.findCompletedFn(ctx, programID, ownerUserID)
}

func (f *fakeRepository) UpdateSessionNotes(ctx context.Context, sessionID, ownerUserID uuid.UUID, notes *string) (*generated.Session, error) {
	f.updateNotesCount++
	f.lastNotes = notes
	f.lastNotesSeen = true
	if f.updateNotesFn == nil {
		return nil, nil
	}
	return f.updateNotesFn(ctx, sessionID, ownerUserID, notes)
}
