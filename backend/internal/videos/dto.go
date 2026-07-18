package videos

import (
	"time"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/storage"
)

type CreateVideoUploadRequest struct {
	Filename    string   `json:"filename" binding:"required" example:"squat-set-1.mp4"`
	ContentType string   `json:"content_type" binding:"required" example:"video/mp4"`
	SizeBytes   int64    `json:"size_bytes" binding:"required" example:"10485760"`
	DurationSec *float64 `json:"duration_sec,omitempty" example:"12.5"`
	Note        *string  `json:"note,omitempty"`
} // @name CreateVideoUploadRequest

type VideoResponse struct {
	ID           uuid.UUID `json:"id"`
	SetLogID     uuid.UUID `json:"set_log_id"`
	Status       string    `json:"status" example:"ready"`
	ContentType  *string   `json:"content_type,omitempty"`
	SizeBytes    *int64    `json:"size_bytes,omitempty"`
	DurationSec  *float64  `json:"duration_sec,omitempty"`
	OriginalName *string   `json:"original_name,omitempty"`
	Note         *string   `json:"note,omitempty"`
	PlaybackURL  *string   `json:"playback_url,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	ReviewedAt       *time.Time `json:"reviewed_at,omitempty"`
	ReviewedByUserID *uuid.UUID `json:"reviewed_by_user_id,omitempty"`
} // @name VideoResponse

type CreateVideoUploadResponse struct {
	Video  VideoResponse           `json:"video"`
	Upload storage.PresignedUpload `json:"upload"`
} // @name CreateVideoUploadResponse

// UpdateVideoRequest is a partial update — currently only the note.
type UpdateVideoRequest struct {
	Note *string `json:"note,omitempty"`
} // @name UpdateVideoRequest
