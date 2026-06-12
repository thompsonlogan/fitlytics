package videos

import (
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

// mapVideo converts a stored row into the client shape. playbackURL is passed
// separately because it is minted per-request (presigned, short-lived) by the
// service rather than persisted on the row.
func mapVideo(v generated.SetVideo, playbackURL *string) VideoResponse {
	return VideoResponse{
		ID:           v.ID,
		SetLogID:     v.SetLogID,
		Status:       v.Status,
		ContentType:  v.ContentType,
		SizeBytes:    v.SizeBytes,
		DurationSec:  v.DurationSec,
		OriginalName: v.OriginalName,
		Note:         v.Note,
		PlaybackURL:  playbackURL,
		CreatedAt:    v.CreatedAt,
	}
}
