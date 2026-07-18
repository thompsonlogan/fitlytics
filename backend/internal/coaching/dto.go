package coaching

import (
	"time"

	"github.com/google/uuid"
)

const (
	StatusActive = "active"
	StatusEnded  = "ended"
)

const (
	setLogStateCompleted  = "completed"
	sessionStateCompleted = "completed"
	videoStatusReady      = "ready"
)

const (
	AthleteStatusNew       = "new"
	AthleteStatusAttention = "attention"
	AthleteStatusOnTrack   = "on-track"
)

type CoachAthleteSummaryResponse struct {
	AthleteUserID uuid.UUID  `json:"athlete_user_id"`
	DisplayName   string     `json:"display_name" example:"Marcus Webb"`
	Email         *string    `json:"email,omitempty" example:"marcus@example.com"`
	ProgramID     *uuid.UUID `json:"program_id,omitempty"`
	ProgramName   *string    `json:"program_name,omitempty" example:"Hypertrophy Block v3"`
	CurrentWeek   int32      `json:"current_week" example:"2"`
	TotalWeeks    int32      `json:"total_weeks" example:"4"`
	CompliancePct     *int32     `json:"compliance_pct,omitempty" example:"75"`
	SessionsCompleted int64      `json:"sessions_completed" example:"3"`
	SessionsDue       int64      `json:"sessions_due" example:"4"`
	AvgRpe            *float64   `json:"avg_rpe,omitempty" example:"8.1"`
	LastSessionAt     *time.Time `json:"last_session_at,omitempty"`
	VideosWaiting     int64      `json:"videos_waiting" example:"3"`
	Status            string     `json:"status" example:"on-track"`
} // @name CoachAthleteSummaryResponse
