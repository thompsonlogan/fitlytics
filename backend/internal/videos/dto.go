package videos

import (
	"time"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/storage"
)

// CreateVideoUploadRequest is the body the client sends to reserve an upload.
// The set the video attaches to is identified by the path (sessionId/setLogId),
// so it isn't repeated here. size_bytes and content_type are validated and then
// bound into the presigned URL, so a client can't upload a larger/other file.
type CreateVideoUploadRequest struct {
	Filename    string   `json:"filename" binding:"required" example:"squat-set-1.mp4"`
	ContentType string   `json:"content_type" binding:"required" example:"video/mp4"`
	SizeBytes   int64    `json:"size_bytes" binding:"required" example:"10485760"`
	DurationSec *float64 `json:"duration_sec,omitempty" example:"12.5"`
	Note        *string  `json:"note,omitempty"`
} // @name CreateVideoUploadRequest

// VideoResponse is the canonical client-facing video shape. PlaybackURL is a
// short-lived presigned GET URL, present only when the video is ready.
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
} // @name VideoResponse

// CreateVideoUploadResponse hands back the freshly-created (pending) video row
// plus the one-time direct-to-store upload instructions.
type CreateVideoUploadResponse struct {
	Video  VideoResponse           `json:"video"`
	Upload storage.PresignedUpload `json:"upload"`
} // @name CreateVideoUploadResponse

// UpdateVideoRequest is a partial update — currently only the note.
type UpdateVideoRequest struct {
	Note *string `json:"note,omitempty"`
} // @name UpdateVideoRequest
