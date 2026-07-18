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

const (
	SideCoach   = "coach"
	SideAthlete = "athlete"
)

type CoachLinkResponse struct {
	LinkID            uuid.UUID `json:"link_id"`
	CounterpartUserID uuid.UUID `json:"counterpart_user_id"`
	CounterpartName   string    `json:"counterpart_name" example:"Dana Kim"`
	Side   string `json:"side" example:"athlete"`
	Status string `json:"status" example:"active"`
} // @name CoachLinkResponse

type CreateCoachNoteRequest struct {
	Body string `json:"body" binding:"required" example:"Hips rise early — cue push the floor away."`
	SetVideoID *uuid.UUID `json:"set_video_id,omitempty"`
} // @name CreateCoachNoteRequest

type CoachNoteResponse struct {
	ID           uuid.UUID  `json:"id"`
	AuthorUserID uuid.UUID  `json:"author_user_id"`
	AuthorName   string     `json:"author_name" example:"Dana Kim"`
	Body         string     `json:"body"`
	SetVideoID   *uuid.UUID `json:"set_video_id,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
} // @name CoachNoteResponse

type CoachAthleteSummaryResponse struct {
	LinkID            uuid.UUID  `json:"link_id"`
	AthleteUserID     uuid.UUID  `json:"athlete_user_id"`
	DisplayName       string     `json:"display_name" example:"Marcus Webb"`
	Email             *string    `json:"email,omitempty" example:"marcus@example.com"`
	ProgramID         *uuid.UUID `json:"program_id,omitempty"`
	ProgramName       *string    `json:"program_name,omitempty" example:"Hypertrophy Block v3"`
	CurrentWeek       int32      `json:"current_week" example:"2"`
	TotalWeeks        int32      `json:"total_weeks" example:"4"`
	CompliancePct     *int32     `json:"compliance_pct,omitempty" example:"75"`
	SessionsCompleted int64      `json:"sessions_completed" example:"3"`
	SessionsDue       int64      `json:"sessions_due" example:"4"`
	AvgRpe            *float64   `json:"avg_rpe,omitempty" example:"8.1"`
	LastSessionAt     *time.Time `json:"last_session_at,omitempty"`
	VideosWaiting     int64      `json:"videos_waiting" example:"3"`
	Status            string     `json:"status" example:"on-track"`
} // @name CoachAthleteSummaryResponse
