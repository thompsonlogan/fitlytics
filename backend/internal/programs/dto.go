package programs

import (
	"time"

	"github.com/google/uuid"
)

type ProgramSummaryResponse struct {
	ID          uuid.UUID `json:"id" example:"8d645f69-e0a2-4b07-a30b-0a20634e2abb"`
	Name        string    `json:"name" example:"Logan PL — May/June 2026 Block"`
	Description *string   `json:"description,omitempty"`
	StartDate   *string   `json:"start_date,omitempty" example:"2026-05-04"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
} // @name ProgramSummaryResponse

type ProgramResponse struct {
	ID          uuid.UUID             `json:"id" example:"8d645f69-e0a2-4b07-a30b-0a20634e2abb"`
	Name        string                `json:"name" example:"Logan PL — May/June 2026 Block"`
	Description *string               `json:"description,omitempty"`
	StartDate   *string               `json:"start_date,omitempty" example:"2026-05-04"`
	CreatedAt   time.Time             `json:"created_at"`
	UpdatedAt   time.Time             `json:"updated_at"`
	Weeks       []ProgramWeekResponse `json:"weeks"`
} // @name ProgramResponse

type ProgramWeekResponse struct {
	ID       uuid.UUID            `json:"id"`
	Sequence int32                `json:"sequence" example:"1"`
	Name     *string              `json:"name,omitempty" example:"Week 1"`
	Notes    *string              `json:"notes,omitempty"`
	Days     []ProgramDayResponse `json:"days"`
} // @name ProgramWeekResponse

type ProgramDayResponse struct {
	ID        uuid.UUID                 `json:"id"`
	Sequence  int32                     `json:"sequence" example:"1"`
	Name      string                    `json:"name" example:"Day 1"`
	Tag       *string                   `json:"tag,omitempty" example:"Day 1"`
	IsRestDay bool                      `json:"is_rest_day" example:"false"`
	Notes     *string                   `json:"notes,omitempty"`
	Exercises []ProgramExerciseResponse `json:"exercises"`
} // @name ProgramDayResponse

type ProgramExerciseResponse struct {
	ID           uuid.UUID                  `json:"id"`
	Sequence     int32                      `json:"sequence" example:"1"`
	ExerciseID   uuid.UUID                  `json:"exercise_id"`
	ExerciseName string                     `json:"exercise_name" example:"Competition Squat"`
	SubText      *string                    `json:"sub_text,omitempty"`
	RestSeconds  *int32                     `json:"rest_seconds,omitempty"`
	Notes        *string                    `json:"notes,omitempty"`
	SetTargets   []ProgramSetTargetResponse `json:"set_targets"`
} // @name ProgramExerciseResponse

type ProgramSetTargetResponse struct {
	ID                     uuid.UUID `json:"id"`
	Sequence               int32     `json:"sequence" example:"1"`
	SetType                string    `json:"set_type" example:"working"`
	SetsCount              int32     `json:"sets_count" example:"2"`
	RepsMin                *int32    `json:"reps_min,omitempty" example:"3"`
	RepsMax                *int32    `json:"reps_max,omitempty" example:"5"`
	IntensityText          *string   `json:"intensity_text,omitempty" example:"285lb (0.95)"`
	PrescribedLoadKg       *float64  `json:"prescribed_load_kg,omitempty" example:"129.27"`
	PrescribedLoadModifier string    `json:"prescribed_load_modifier" example:"absolute"`
	CapLoadKg              *float64  `json:"cap_load_kg,omitempty"`
	PrescribedRpe          *float64  `json:"prescribed_rpe,omitempty" example:"5"`
} // @name ProgramSetTargetResponse
