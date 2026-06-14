package videos

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
	"github.com/thompsonlogan/fitlytics/backend/internal/storage"
)

func silentLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func testLimits() Limits { return Limits{MaxBytes: 500 * 1024 * 1024, MaxPerUser: 200, MaxPerDay: 50} }

// ─── fakes ──────────────────────────────────────────────────────────────────

type fakeRepo struct {
	verifyOwnedFn func(ctx context.Context, sessionID, setLogID, ownerID uuid.UUID) error
	createFn      func(ctx context.Context, ownerID uuid.UUID, row *generated.SetVideo, maxPerUser, maxPerDay int) (string, error)
	getOwnedFn    func(ctx context.Context, videoID, ownerID uuid.UUID) (*generated.SetVideo, error)
	markReadyFn   func(ctx context.Context, videoID uuid.UUID, size int64) (*generated.SetVideo, error)
	markFailedFn  func(ctx context.Context, videoID uuid.UUID) error
	updateNoteFn  func(ctx context.Context, videoID, ownerID uuid.UUID, note *string) (*generated.SetVideo, error)
	softDeleteFn  func(ctx context.Context, videoID, ownerID uuid.UUID) (string, error)
	listFn        func(ctx context.Context, sessionID, ownerID uuid.UUID) ([]generated.SetVideo, error)
}

func (f *fakeRepo) VerifySetLogOwned(ctx context.Context, s, l, o uuid.UUID) error {
	return f.verifyOwnedFn(ctx, s, l, o)
}
func (f *fakeRepo) CreateUpload(ctx context.Context, o uuid.UUID, row *generated.SetVideo, mpu, mpd int) (string, error) {
	return f.createFn(ctx, o, row, mpu, mpd)
}
func (f *fakeRepo) GetOwned(ctx context.Context, v, o uuid.UUID) (*generated.SetVideo, error) {
	return f.getOwnedFn(ctx, v, o)
}
func (f *fakeRepo) MarkReady(ctx context.Context, v uuid.UUID, size int64) (*generated.SetVideo, error) {
	return f.markReadyFn(ctx, v, size)
}
func (f *fakeRepo) MarkFailed(ctx context.Context, v uuid.UUID) error { return f.markFailedFn(ctx, v) }
func (f *fakeRepo) UpdateNote(ctx context.Context, v, o uuid.UUID, n *string) (*generated.SetVideo, error) {
	return f.updateNoteFn(ctx, v, o, n)
}
func (f *fakeRepo) SoftDelete(ctx context.Context, v, o uuid.UUID) (string, error) {
	return f.softDeleteFn(ctx, v, o)
}
func (f *fakeRepo) ListBySession(ctx context.Context, s, o uuid.UUID) ([]generated.SetVideo, error) {
	return f.listFn(ctx, s, o)
}

type fakeStore struct {
	presignPutFn func(ctx context.Context, key, ct string, size int64, ttl time.Duration) (storage.PresignedUpload, error)
	presignGetFn func(ctx context.Context, key string, ttl time.Duration) (string, error)
	headFn       func(ctx context.Context, key string) (storage.HeadResult, error)
	deleted      []string
	deleteErr    error
}

func (f *fakeStore) PresignPut(ctx context.Context, key, ct string, size int64, ttl time.Duration) (storage.PresignedUpload, error) {
	if f.presignPutFn != nil {
		return f.presignPutFn(ctx, key, ct, size, ttl)
	}
	return storage.PresignedUpload{URL: "https://r2/" + key, Method: "PUT"}, nil
}
func (f *fakeStore) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if f.presignGetFn != nil {
		return f.presignGetFn(ctx, key, ttl)
	}
	return "https://r2/get/" + key, nil
}
func (f *fakeStore) Head(ctx context.Context, key string) (storage.HeadResult, error) {
	return f.headFn(ctx, key)
}
func (f *fakeStore) Delete(ctx context.Context, key string) error {
	f.deleted = append(f.deleted, key)
	return f.deleteErr
}

func okOwnership() func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) error {
	return func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) error { return nil }
}

// ─── CreateUpload ───────────────────────────────────────────────────────────

func TestCreateUpload_RejectsUnsupportedContentType(t *testing.T) {
	svc := NewService(&fakeRepo{}, &fakeStore{}, testLimits(), silentLogger())
	_, err := svc.CreateUpload(context.Background(), uuid.New(), uuid.New(), uuid.New(),
		CreateVideoUploadRequest{Filename: "x.gif", ContentType: "image/gif", SizeBytes: 10})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("want ErrInvalidInput, got %v", err)
	}
}

func TestCreateUpload_RejectsOversize(t *testing.T) {
	svc := NewService(&fakeRepo{}, &fakeStore{}, testLimits(), silentLogger())
	_, err := svc.CreateUpload(context.Background(), uuid.New(), uuid.New(), uuid.New(),
		CreateVideoUploadRequest{Filename: "x.mp4", ContentType: "video/mp4", SizeBytes: 600 * 1024 * 1024})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("want ErrInvalidInput, got %v", err)
	}
}

func TestCreateUpload_RejectsNonPositiveSize(t *testing.T) {
	svc := NewService(&fakeRepo{}, &fakeStore{}, testLimits(), silentLogger())
	_, err := svc.CreateUpload(context.Background(), uuid.New(), uuid.New(), uuid.New(),
		CreateVideoUploadRequest{Filename: "x.mp4", ContentType: "video/mp4", SizeBytes: 0})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("want ErrInvalidInput, got %v", err)
	}
}

func TestCreateUpload_UnownedSetLogIsNotFound(t *testing.T) {
	repo := &fakeRepo{
		verifyOwnedFn: func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) error {
			return gorm.ErrRecordNotFound
		},
	}
	svc := NewService(repo, &fakeStore{}, testLimits(), silentLogger())
	_, err := svc.CreateUpload(context.Background(), uuid.New(), uuid.New(), uuid.New(),
		CreateVideoUploadRequest{Filename: "x.mp4", ContentType: "video/mp4", SizeBytes: 10})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestCreateUpload_QuotaExceededPropagates(t *testing.T) {
	repo := &fakeRepo{
		verifyOwnedFn: okOwnership(),
		createFn: func(context.Context, uuid.UUID, *generated.SetVideo, int, int) (string, error) {
			return "", ErrQuotaExceeded
		},
	}
	svc := NewService(repo, &fakeStore{}, testLimits(), silentLogger())
	_, err := svc.CreateUpload(context.Background(), uuid.New(), uuid.New(), uuid.New(),
		CreateVideoUploadRequest{Filename: "x.mp4", ContentType: "video/mp4", SizeBytes: 10})
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("want ErrQuotaExceeded, got %v", err)
	}
}

func TestCreateUpload_HappyPathPresignsAndPurgesReplaced(t *testing.T) {
	var inserted *generated.SetVideo
	repo := &fakeRepo{
		verifyOwnedFn: okOwnership(),
		createFn: func(_ context.Context, _ uuid.UUID, row *generated.SetVideo, _, _ int) (string, error) {
			inserted = row
			return "old/key.mp4", nil // a prior video existed and was replaced
		},
	}
	store := &fakeStore{}
	svc := NewService(repo, store, testLimits(), silentLogger())

	setLogID, ownerID := uuid.New(), uuid.New()
	resp, err := svc.CreateUpload(context.Background(), uuid.New(), setLogID, ownerID,
		CreateVideoUploadRequest{Filename: "squat.mp4", ContentType: "video/mp4", SizeBytes: 1234})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if inserted == nil || inserted.SetLogID != setLogID || inserted.UserID != ownerID || inserted.Status != "pending" {
		t.Fatalf("inserted row wrong: %+v", inserted)
	}
	if inserted.StorageKey == "" || resp.Upload.URL == "" {
		t.Fatalf("expected a storage key + upload url, got key=%q url=%q", inserted.StorageKey, resp.Upload.URL)
	}
	if len(store.deleted) != 1 || store.deleted[0] != "old/key.mp4" {
		t.Fatalf("expected replaced object to be purged, deleted=%v", store.deleted)
	}
	if resp.Video.Status != "pending" || resp.Video.PlaybackURL != nil {
		t.Fatalf("pending video should have no playback url: %+v", resp.Video)
	}
}

// ─── Finalize ───────────────────────────────────────────────────────────────

func readyRow(id uuid.UUID) *generated.SetVideo {
	return &generated.SetVideo{ID: id, SetLogID: uuid.New(), UserID: uuid.New(), Status: "pending", StorageKey: "k.mp4"}
}

// sizedRow is readyRow plus a reserved SizeBytes, for exercising the finalize
// integrity check that compares reserved vs stored size.
func sizedRow(id uuid.UUID, size int64) *generated.SetVideo {
	row := readyRow(id)
	row.SizeBytes = &size
	return row
}

// typedRow is sizedRow plus a reserved ContentType, for exercising the finalize
// integrity check that compares reserved vs stored content-type.
func typedRow(id uuid.UUID, size int64, ct string) *generated.SetVideo {
	row := sizedRow(id, size)
	row.ContentType = &ct
	return row
}

func TestFinalize_MissingObjectMarksFailed(t *testing.T) {
	id := uuid.New()
	failed := false
	repo := &fakeRepo{
		getOwnedFn:   func(context.Context, uuid.UUID, uuid.UUID) (*generated.SetVideo, error) { return readyRow(id), nil },
		markFailedFn: func(context.Context, uuid.UUID) error { failed = true; return nil },
	}
	store := &fakeStore{headFn: func(context.Context, string) (storage.HeadResult, error) {
		return storage.HeadResult{}, fmt.Errorf("head object: %w", storage.ErrNotFound)
	}}
	svc := NewService(repo, store, testLimits(), silentLogger())

	_, err := svc.Finalize(context.Background(), id, uuid.New())
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("want ErrInvalidInput, got %v", err)
	}
	if !failed {
		t.Error("expected the video to be marked failed")
	}
}

func TestFinalize_TransientHeadErrorLeavesPending(t *testing.T) {
	id := uuid.New()
	markFailedCalled := false
	repo := &fakeRepo{
		getOwnedFn:   func(context.Context, uuid.UUID, uuid.UUID) (*generated.SetVideo, error) { return readyRow(id), nil },
		markFailedFn: func(context.Context, uuid.UUID) error { markFailedCalled = true; return nil },
	}
	store := &fakeStore{headFn: func(context.Context, string) (storage.HeadResult, error) {
		return storage.HeadResult{}, errors.New("connection reset")
	}}
	svc := NewService(repo, store, testLimits(), silentLogger())

	_, err := svc.Finalize(context.Background(), id, uuid.New())
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if errors.Is(err, ErrInvalidInput) {
		t.Fatalf("transient error should not be ErrInvalidInput, got %v", err)
	}
	if markFailedCalled {
		t.Error("expected the video to NOT be marked failed on a transient error")
	}
}

func TestFinalize_OversizeObjectIsDeletedAndRejected(t *testing.T) {
	id := uuid.New()
	repo := &fakeRepo{
		getOwnedFn:   func(context.Context, uuid.UUID, uuid.UUID) (*generated.SetVideo, error) { return readyRow(id), nil },
		markFailedFn: func(context.Context, uuid.UUID) error { return nil },
	}
	store := &fakeStore{headFn: func(context.Context, string) (storage.HeadResult, error) {
		return storage.HeadResult{SizeBytes: 600 * 1024 * 1024}, nil
	}}
	svc := NewService(repo, store, testLimits(), silentLogger())

	_, err := svc.Finalize(context.Background(), id, uuid.New())
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("want ErrInvalidInput, got %v", err)
	}
	if len(store.deleted) != 1 {
		t.Errorf("expected oversize object to be purged, deleted=%v", store.deleted)
	}
}

func TestFinalize_SizeMismatchIsDeletedAndRejected(t *testing.T) {
	id := uuid.New()
	failed := false
	markReadyCalled := false
	repo := &fakeRepo{
		// Reserved 1 MB, but only part of it landed.
		getOwnedFn:   func(context.Context, uuid.UUID, uuid.UUID) (*generated.SetVideo, error) { return sizedRow(id, 1_000_000), nil },
		markFailedFn: func(context.Context, uuid.UUID) error { failed = true; return nil },
		markReadyFn: func(context.Context, uuid.UUID, int64) (*generated.SetVideo, error) {
			markReadyCalled = true
			return nil, nil
		},
	}
	store := &fakeStore{headFn: func(context.Context, string) (storage.HeadResult, error) {
		return storage.HeadResult{SizeBytes: 4096}, nil // truncated/partial upload
	}}
	svc := NewService(repo, store, testLimits(), silentLogger())

	_, err := svc.Finalize(context.Background(), id, uuid.New())
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("want ErrInvalidInput, got %v", err)
	}
	if !failed {
		t.Error("expected the mismatched video to be marked failed")
	}
	if markReadyCalled {
		t.Error("a mismatched upload must not be marked ready")
	}
	if len(store.deleted) != 1 {
		t.Errorf("expected mismatched object to be purged, deleted=%v", store.deleted)
	}
}

func TestFinalize_ContentTypeMismatchIsDeletedAndRejected(t *testing.T) {
	id := uuid.New()
	failed := false
	markReadyCalled := false
	repo := &fakeRepo{
		// Reserved an mp4, but a different type landed at the slot.
		getOwnedFn:   func(context.Context, uuid.UUID, uuid.UUID) (*generated.SetVideo, error) { return typedRow(id, 4096, "video/mp4"), nil },
		markFailedFn: func(context.Context, uuid.UUID) error { failed = true; return nil },
		markReadyFn: func(context.Context, uuid.UUID, int64) (*generated.SetVideo, error) {
			markReadyCalled = true
			return nil, nil
		},
	}
	store := &fakeStore{headFn: func(context.Context, string) (storage.HeadResult, error) {
		return storage.HeadResult{SizeBytes: 4096, ContentType: "text/html"}, nil
	}}
	svc := NewService(repo, store, testLimits(), silentLogger())

	_, err := svc.Finalize(context.Background(), id, uuid.New())
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("want ErrInvalidInput, got %v", err)
	}
	if !failed {
		t.Error("expected the mismatched-type video to be marked failed")
	}
	if markReadyCalled {
		t.Error("a content-type mismatch must not be marked ready")
	}
	if len(store.deleted) != 1 {
		t.Errorf("expected mismatched-type object to be purged, deleted=%v", store.deleted)
	}
}

func TestFinalize_MatchingContentTypePasses(t *testing.T) {
	id := uuid.New()
	repo := &fakeRepo{
		getOwnedFn: func(context.Context, uuid.UUID, uuid.UUID) (*generated.SetVideo, error) { return typedRow(id, 4096, "video/mp4"), nil },
		markReadyFn: func(_ context.Context, v uuid.UUID, size int64) (*generated.SetVideo, error) {
			return &generated.SetVideo{ID: v, Status: "ready", StorageKey: "k.mp4", SizeBytes: &size}, nil
		},
	}
	store := &fakeStore{headFn: func(context.Context, string) (storage.HeadResult, error) {
		return storage.HeadResult{SizeBytes: 4096, ContentType: "video/mp4"}, nil
	}}
	svc := NewService(repo, store, testLimits(), silentLogger())

	out, err := svc.Finalize(context.Background(), id, uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.Status != "ready" {
		t.Fatalf("expected ready video, got %+v", out)
	}
}

func TestFinalize_HappyPathMarksReadyWithPlayback(t *testing.T) {
	id := uuid.New()
	repo := &fakeRepo{
		// Reserved size matches what landed, so the integrity check passes.
		getOwnedFn: func(context.Context, uuid.UUID, uuid.UUID) (*generated.SetVideo, error) { return sizedRow(id, 4096), nil },
		markReadyFn: func(_ context.Context, v uuid.UUID, size int64) (*generated.SetVideo, error) {
			return &generated.SetVideo{ID: v, Status: "ready", StorageKey: "k.mp4", SizeBytes: &size}, nil
		},
	}
	store := &fakeStore{headFn: func(context.Context, string) (storage.HeadResult, error) {
		return storage.HeadResult{SizeBytes: 4096}, nil
	}}
	svc := NewService(repo, store, testLimits(), silentLogger())

	out, err := svc.Finalize(context.Background(), id, uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out.Status != "ready" || out.PlaybackURL == nil {
		t.Fatalf("expected ready video with playback url: %+v", out)
	}
}

// ─── ListForSession / Delete ────────────────────────────────────────────────

func TestListForSession_PlaybackOnlyForReady(t *testing.T) {
	repo := &fakeRepo{listFn: func(context.Context, uuid.UUID, uuid.UUID) ([]generated.SetVideo, error) {
		return []generated.SetVideo{
			{ID: uuid.New(), Status: "ready", StorageKey: "a.mp4"},
			{ID: uuid.New(), Status: "pending", StorageKey: "b.mp4"},
		}, nil
	}}
	svc := NewService(repo, &fakeStore{}, testLimits(), silentLogger())

	out, err := svc.ListForSession(context.Background(), uuid.New(), uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("want 2 videos, got %d", len(out))
	}
	if out[0].PlaybackURL == nil {
		t.Error("ready video should have a playback url")
	}
	if out[1].PlaybackURL != nil {
		t.Error("pending video should not have a playback url")
	}
}

func TestListForSession_UnownedSessionYieldsEmpty(t *testing.T) {
	repo := &fakeRepo{listFn: func(context.Context, uuid.UUID, uuid.UUID) ([]generated.SetVideo, error) {
		return nil, gorm.ErrRecordNotFound
	}}
	svc := NewService(repo, &fakeStore{}, testLimits(), silentLogger())

	out, err := svc.ListForSession(context.Background(), uuid.New(), uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out) != 0 {
		t.Fatalf("want empty list, got %d", len(out))
	}
}

func TestDelete_PurgesObject(t *testing.T) {
	repo := &fakeRepo{softDeleteFn: func(context.Context, uuid.UUID, uuid.UUID) (string, error) {
		return "users/x/set-videos/y.mp4", nil
	}}
	store := &fakeStore{}
	svc := NewService(repo, store, testLimits(), silentLogger())

	if err := svc.Delete(context.Background(), uuid.New(), uuid.New()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(store.deleted) != 1 || store.deleted[0] != "users/x/set-videos/y.mp4" {
		t.Fatalf("expected object purge, deleted=%v", store.deleted)
	}
}

func TestDelete_NotFound(t *testing.T) {
	repo := &fakeRepo{softDeleteFn: func(context.Context, uuid.UUID, uuid.UUID) (string, error) {
		return "", gorm.ErrRecordNotFound
	}}
	svc := NewService(repo, &fakeStore{}, testLimits(), silentLogger())

	if err := svc.Delete(context.Background(), uuid.New(), uuid.New()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}
