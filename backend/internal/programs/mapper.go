package programs

import (
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models"
)

// This file holds the pure model→DTO translation functions for the program
// aggregate. They are kept separate from service.go so the service stays
// focused on orchestration and error handling; the mappers themselves take no
// dependencies beyond the models package and are trivial to unit test.

// collectExerciseIDs returns the distinct set of exercise ids referenced by
// the loaded program tree. Used by the service to bulk-fetch exercise names
// in one query rather than N round-trips.
func collectExerciseIDs(p *models.Program) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{})
	ids := make([]uuid.UUID, 0)
	for _, w := range p.Weeks {
		for _, d := range w.Days {
			for _, e := range d.Exercises {
				if _, ok := seen[e.ExerciseID]; ok {
					continue
				}
				seen[e.ExerciseID] = struct{}{}
				ids = append(ids, e.ExerciseID)
			}
		}
	}
	return ids
}

// mapProgram converts a loaded program aggregate (with all children preloaded)
// into the API response shape. The `names` map supplies the canonical exercise
// name for each program_exercise row; entries missing from the map fall back
// to the empty string (should not happen — the exercise_id FK is RESTRICT).
func mapProgram(p *models.Program, names map[uuid.UUID]string) *ProgramResponse {
	out := &ProgramResponse{
		ID:          p.ID,
		Name:        p.Name,
		Description: p.Description,
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
		Weeks:       make([]ProgramWeekResponse, 0, len(p.Weeks)),
	}
	for _, w := range p.Weeks {
		out.Weeks = append(out.Weeks, mapWeek(w, names))
	}
	return out
}

func mapWeek(w models.ProgramWeek, names map[uuid.UUID]string) ProgramWeekResponse {
	out := ProgramWeekResponse{
		ID:       w.ID,
		Sequence: w.Sequence,
		Name:     w.Name,
		Notes:    w.Notes,
		Days:     make([]ProgramDayResponse, 0, len(w.Days)),
	}
	for _, d := range w.Days {
		out.Days = append(out.Days, mapDay(d, names))
	}
	return out
}

func mapDay(d models.ProgramDay, names map[uuid.UUID]string) ProgramDayResponse {
	out := ProgramDayResponse{
		ID:        d.ID,
		Sequence:  d.Sequence,
		Name:      d.Name,
		Tag:       d.Tag,
		IsRestDay: d.IsRestDay,
		Notes:     d.Notes,
		Exercises: make([]ProgramExerciseResponse, 0, len(d.Exercises)),
	}
	for _, e := range d.Exercises {
		out.Exercises = append(out.Exercises, mapExercise(e, names))
	}
	return out
}

func mapExercise(e models.ProgramExercise, names map[uuid.UUID]string) ProgramExerciseResponse {
	out := ProgramExerciseResponse{
		ID:           e.ID,
		Sequence:     e.Sequence,
		ExerciseID:   e.ExerciseID,
		ExerciseName: names[e.ExerciseID],
		SubText:      e.SubText,
		RestSeconds:  e.RestSeconds,
		Notes:        e.Notes,
		SetTargets:   make([]ProgramSetTargetResponse, 0, len(e.SetTargets)),
	}
	for _, t := range e.SetTargets {
		out.SetTargets = append(out.SetTargets, mapSetTarget(t))
	}
	return out
}

func mapSetTarget(t models.ProgramSetTarget) ProgramSetTargetResponse {
	return ProgramSetTargetResponse{
		ID:                     t.ID,
		Sequence:               t.Sequence,
		SetType:                t.SetType,
		SetsCount:              t.SetsCount,
		RepsMin:                t.RepsMin,
		RepsMax:                t.RepsMax,
		IntensityText:          t.IntensityText,
		PrescribedLoadKg:       t.PrescribedLoadKg,
		PrescribedLoadModifier: t.PrescribedLoadModifier,
		CapLoadKg:              t.CapLoadKg,
		PrescribedRpe:          t.PrescribedRpe,
	}
}
