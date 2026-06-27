package sessions

import (
	"time"

	"github.com/google/uuid"
)

type SessionResponse struct {
	ID                  uuid.UUID  `json:"id"`
	UserID              uuid.UUID  `json:"user_id"`
	ProgramDayID        *uuid.UUID `json:"program_day_id,omitempty"`
	ProgramNameSnapshot *string    `json:"program_name_snapshot,omitempty"`
	DayNameSnapshot     *string    `json:"day_name_snapshot,omitempty"`
	State               string     `json:"state" example:"in_progress"`
	StartedAt           *time.Time `json:"started_at,omitempty"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	// Notes is the athlete's own free-text note for this workout ("Your notes"
	// in the UI). Distinct from the program day's coach note, which is
	// prescription-side and read-only.
	Notes     *string                   `json:"notes,omitempty"`
	Exercises []SessionExerciseResponse `json:"exercises"`
} // @name SessionResponse

// UpdateSessionRequest is the update body for a session. Notes is written
// verbatim: a string (including "") sets the note, and a null/omitted value
// clears it to SQL NULL. The single-field shape means callers always send the
// note's full new value rather than a partial patch.
type UpdateSessionRequest struct {
	Notes *string `json:"notes" example:"Felt strong, bar speed good on the openers."`
} // @name UpdateSessionRequest

type SessionExerciseResponse struct {
	ID                   uuid.UUID        `json:"id"`
	Sequence             int32            `json:"sequence"`
	ExerciseID           uuid.UUID        `json:"exercise_id"`
	ExerciseNameSnapshot string           `json:"exercise_name_snapshot"`
	SubSnapshot          *string          `json:"sub_snapshot,omitempty"`
	RestSecondsSnapshot  *int32           `json:"rest_seconds_snapshot,omitempty"`
	SetLogs              []SetLogResponse `json:"set_logs"`
} // @name SessionExerciseResponse

type SetLogResponse struct {
	ID       uuid.UUID `json:"id"`
	Sequence int32     `json:"sequence"`
	// GroupID is the snapshot of the originating program_set_group.id. Set logs
	// that share a group_id are the individual sets of one prescribed block, so
	// the frontend groups them back under a single table row. Null for ad-hoc sets.
	GroupID *uuid.UUID `json:"group_id,omitempty"`
	SetType string     `json:"set_type" example:"working"`
	// prescription snapshot
	RepsTargetMin          *int32   `json:"reps_target_min,omitempty"`
	RepsTargetMax          *int32   `json:"reps_target_max,omitempty"`
	PrescribedLoadKg       *float64 `json:"prescribed_load_kg,omitempty"`
	PrescribedLoadModifier string   `json:"prescribed_load_modifier" example:"absolute"`
	PrescribedRpe          *float64 `json:"prescribed_rpe,omitempty"`
	IntensityText          *string  `json:"intensity_text,omitempty"`
	// actuals
	RepsActual         *int32   `json:"reps_actual,omitempty"`
	ActualLoadKg       *float64 `json:"actual_load_kg,omitempty"`
	ActualLoadModifier string   `json:"actual_load_modifier" example:"absolute"`
	ActualRpe          *float64 `json:"actual_rpe,omitempty"`
	State              string   `json:"state" example:"pending"`
} // @name SetLogResponse

type UpdateSetLogRequest struct {
	RepsActual   *int32   `json:"reps_actual,omitempty" example:"8"`
	ActualLoadKg *float64 `json:"actual_load_kg,omitempty" example:"129.27"`
	ActualRpe    *float64 `json:"actual_rpe,omitempty" example:"8.5"`
	State        *string  `json:"state,omitempty" example:"completed"`
} // @name UpdateSetLogRequest

type BatchUpdateSetLogItem struct {
	SetLogID uuid.UUID `json:"set_log_id" binding:"required"`
	UpdateSetLogRequest
} // @name BatchUpdateSetLogItem

type BatchUpdateSetLogsRequest struct {
	Updates []BatchUpdateSetLogItem `json:"updates" binding:"required,min=1,max=50"`
} // @name BatchUpdateSetLogsRequest

type CompletedDayResponse struct {
	WeekSequence int32 `json:"week_sequence" example:"4"`
	DaySequence  int32 `json:"day_sequence" example:"1"`
} // @name CompletedDayResponse
