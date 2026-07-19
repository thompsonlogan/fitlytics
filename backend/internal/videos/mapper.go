package videos

import (
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func mapVideo(v generated.SetVideo, playbackURL *string) VideoResponse {
	return VideoResponse{
		ID:               v.ID,
		SetLogID:         v.SetLogID,
		Status:           v.Status,
		ContentType:      v.ContentType,
		SizeBytes:        v.SizeBytes,
		DurationSec:      v.DurationSec,
		OriginalName:     v.OriginalName,
		Note:             v.Note,
		PlaybackURL:      playbackURL,
		CreatedAt:        v.CreatedAt,
		ReviewedAt:       v.ReviewedAt,
		ReviewedByUserID: v.ReviewedByUserID,
	}
}
