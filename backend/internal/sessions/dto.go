package sessions

import (
	"time"

	"github.com/google/uuid"
)

type SessionResponse struct {
	ID              uuid.UUID                 `json:"id"`
	UserID          uuid.UUID                 `json:"user_id"`
	ProgramDayID    *uuid.UUID                `json:"program_day_id,omitempty"`
	ProgramNameSnap *string                   `json:"program_name_snap,omitempty"`
	DayNameSnap     *string                   `json:"day_name_snap,omitempty"`
	State           string                    `json:"state" example:"in_progress"`
	StartedAt       *time.Time                `json:"started_at,omitempty"`
	CompletedAt     *time.Time                `json:"completed_at,omitempty"`
	Exercises       []SessionExerciseResponse `json:"exercises"`
} // @name SessionResponse

type SessionExerciseResponse struct {
	ID               uuid.UUID         `json:"id"`
	Sequence         int32             `json:"sequence"`
	ExerciseID       uuid.UUID         `json:"exercise_id"`
	ExerciseNameSnap string            `json:"exercise_name_snap"`
	SubSnap          *string           `json:"sub_snap,omitempty"`
	RestSecondsSnap  *int32            `json:"rest_seconds_snap,omitempty"`
	SetLogs          []SetLogResponse  `json:"set_logs"`
} // @name SessionExerciseResponse

type SetLogResponse struct {
	ID                     uuid.UUID `json:"id"`
	Sequence               int32     `json:"sequence"`
	SetType                string    `json:"set_type" example:"working"`
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
	ActualLoadKg *float64 `json:"actual_load_kg,omitempty" example:"129.27"`
	ActualRpe    *float64 `json:"actual_rpe,omitempty" example:"8.5"`
	State        *string  `json:"state,omitempty" example:"completed"`
} // @name UpdateSetLogRequest

type CompletedDayResponse struct {
	WeekSequence int32 `json:"week_sequence" example:"4"`
	DaySequence  int32 `json:"day_sequence" example:"1"`
} // @name CompletedDayResponse

