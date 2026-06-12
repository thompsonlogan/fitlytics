package videos

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
	"github.com/thompsonlogan/fitlytics/backend/internal/storage"
)

var (
	ErrNotFound     = errors.New("video not found")
	ErrInvalidInput = errors.New("invalid input")
)

const (
	uploadURLTTL   = 10 * time.Minute
	playbackURLTTL = 6 * time.Hour
)

// allowedContentTypes maps each accepted upload MIME type to the file extension
// used in the storage key. Anything not in this set is rejected before a URL is
// ever issued.
var allowedContentTypes = map[string]string{
	"video/mp4":       "mp4",
	"video/quicktime": "mov",
	"video/webm":      "webm",
}

// Limits are the abuse safeguards, sourced from config.
type Limits struct {
	MaxBytes   int64
	MaxPerUser int
	MaxPerDay  int
}

type Service interface {
	CreateUpload(ctx context.Context, sessionID, setLogID, ownerID uuid.UUID, in CreateVideoUploadRequest) (*CreateVideoUploadResponse, error)
	Finalize(ctx context.Context, videoID, ownerID uuid.UUID) (*VideoResponse, error)
	ListForSession(ctx context.Context, sessionID, ownerID uuid.UUID) ([]VideoResponse, error)
	UpdateNote(ctx context.Context, videoID, ownerID uuid.UUID, in UpdateVideoRequest) (*VideoResponse, error)
	Delete(ctx context.Context, videoID, ownerID uuid.UUID) error
}

type service struct {
	repo   Repository
	store  storage.ObjectStore
	limits Limits
	log    *slog.Logger
}

func NewService(repo Repository, store storage.ObjectStore, limits Limits, log *slog.Logger) Service {
	return &service{repo: repo, store: store, limits: limits, log: log}
}

func (s *service) CreateUpload(ctx context.Context, sessionID, setLogID, ownerID uuid.UUID, in CreateVideoUploadRequest) (*CreateVideoUploadResponse, error) {
	ext, ok := allowedContentTypes[in.ContentType]
	if !ok {
		return nil, fmt.Errorf("%w: unsupported content type %q", ErrInvalidInput, in.ContentType)
	}
	if in.SizeBytes <= 0 {
		return nil, fmt.Errorf("%w: size_bytes must be positive", ErrInvalidInput)
	}
	if in.SizeBytes > s.limits.MaxBytes {
		return nil, fmt.Errorf("%w: file exceeds the %d byte limit", ErrInvalidInput, s.limits.MaxBytes)
	}

	if err := s.repo.VerifySetLogOwned(ctx, sessionID, setLogID, ownerID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("verify set log ownership: %w", err)
	}

	key := fmt.Sprintf("users/%s/set-videos/%s.%s", ownerID, uuid.New(), ext)
	row := &generated.SetVideo{
		ID:           uuid.New(),
		SetLogID:     setLogID,
		UserID:       ownerID,
		Status:       "pending",
		StorageKey:   key,
		ContentType:  &in.ContentType,
		SizeBytes:    &in.SizeBytes,
		DurationSec:  in.DurationSec,
		OriginalName: &in.Filename,
		Note:         in.Note,
	}

	oldKey, err := s.repo.CreateUpload(ctx, ownerID, row, s.limits.MaxPerUser, s.limits.MaxPerDay)
	if err != nil {
		if errors.Is(err, ErrQuotaExceeded) {
			return nil, err
		}
		return nil, fmt.Errorf("create upload: %w", err)
	}

	// Purge the replaced object outside the DB transaction. Best-effort: a leaked
	// object is recoverable, but the row swap has already committed.
	if oldKey != "" {
		if derr := s.store.Delete(ctx, oldKey); derr != nil {
			s.log.Warn("failed to delete replaced video object", slog.String("key", oldKey), slog.Any("error", derr))
		}
	}

	upload, err := s.store.PresignPut(ctx, key, in.ContentType, in.SizeBytes, uploadURLTTL)
	if err != nil {
		return nil, fmt.Errorf("presign upload: %w", err)
	}

	return &CreateVideoUploadResponse{Video: mapVideo(*row, nil), Upload: upload}, nil
}

func (s *service) Finalize(ctx context.Context, videoID, ownerID uuid.UUID) (*VideoResponse, error) {
	row, err := s.repo.GetOwned(ctx, videoID, ownerID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get video: %w", err)
	}

	head, err := s.store.Head(ctx, row.StorageKey)
	if err != nil {
		// No object landed — mark failed so the slot frees up and reject.
		_ = s.repo.MarkFailed(ctx, videoID)
		return nil, fmt.Errorf("%w: upload not found in storage", ErrInvalidInput)
	}
	if head.SizeBytes > s.limits.MaxBytes {
		if derr := s.store.Delete(ctx, row.StorageKey); derr != nil {
			s.log.Warn("failed to delete oversize video object", slog.String("key", row.StorageKey), slog.Any("error", derr))
		}
		_ = s.repo.MarkFailed(ctx, videoID)
		return nil, fmt.Errorf("%w: uploaded file exceeds the size limit", ErrInvalidInput)
	}

	updated, err := s.repo.MarkReady(ctx, videoID, head.SizeBytes)
	if err != nil {
		return nil, fmt.Errorf("mark ready: %w", err)
	}

	playback := s.playbackURL(ctx, updated.StorageKey)
	return ptr(mapVideo(*updated, playback)), nil
}

func (s *service) ListForSession(ctx context.Context, sessionID, ownerID uuid.UUID) ([]VideoResponse, error) {
	rows, err := s.repo.ListBySession(ctx, sessionID, ownerID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// No such (owned) session yet — treat as no videos.
			return []VideoResponse{}, nil
		}
		return nil, fmt.Errorf("list session videos: %w", err)
	}

	out := make([]VideoResponse, 0, len(rows))
	for _, row := range rows {
		var playback *string
		if row.Status == "ready" {
			playback = s.playbackURL(ctx, row.StorageKey)
		}
		out = append(out, mapVideo(row, playback))
	}
	return out, nil
}

func (s *service) UpdateNote(ctx context.Context, videoID, ownerID uuid.UUID, in UpdateVideoRequest) (*VideoResponse, error) {
	updated, err := s.repo.UpdateNote(ctx, videoID, ownerID, in.Note)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update note: %w", err)
	}

	var playback *string
	if updated.Status == "ready" {
		playback = s.playbackURL(ctx, updated.StorageKey)
	}
	return ptr(mapVideo(*updated, playback)), nil
}

func (s *service) Delete(ctx context.Context, videoID, ownerID uuid.UUID) error {
	key, err := s.repo.SoftDelete(ctx, videoID, ownerID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return fmt.Errorf("delete video: %w", err)
	}
	if derr := s.store.Delete(ctx, key); derr != nil {
		s.log.Warn("failed to delete video object", slog.String("key", key), slog.Any("error", derr))
	}
	return nil
}

// playbackURL mints a short-lived read URL, swallowing errors to a nil pointer
// so a transient presign failure degrades to "no playback" rather than failing
// the whole list/finalize response.
func (s *service) playbackURL(ctx context.Context, key string) *string {
	url, err := s.store.PresignGet(ctx, key, playbackURLTTL)
	if err != nil {
		s.log.Warn("failed to presign playback url", slog.String("key", key), slog.Any("error", err))
		return nil
	}
	return &url
}

func ptr[T any](v T) *T { return &v }
