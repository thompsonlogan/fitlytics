package programs

import (
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
	"github.com/thompsonlogan/fitlytics/backend/internal/timeutil"
)

func mapProgramSummaries(rows []generated.Program) []ProgramSummaryResponse {
	out := make([]ProgramSummaryResponse, 0, len(rows))
	for _, p := range rows {
		out = append(out, ProgramSummaryResponse{
			ID:          p.ID,
			Name:        p.Name,
			Description: p.Description,
			StartDate:   timeutil.FormatDatePtr(p.StartDate),
			CreatedAt:   p.CreatedAt,
			UpdatedAt:   p.UpdatedAt,
		})
	}
	return out
}

func mapProgram(p *generated.Program, names map[uuid.UUID]string) *ProgramResponse {
	out := &ProgramResponse{
		ID:          p.ID,
		Name:        p.Name,
		Description: p.Description,
		StartDate:   timeutil.FormatDatePtr(p.StartDate),
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
		Blocks:      make([]ProgramBlockResponse, 0, len(p.Blocks)),
	}
	// Blocks arrive sorted by sequence; index them so each week (also sorted,
	// by its global sequence) lands under its owning block in order.
	idx := make(map[uuid.UUID]int, len(p.Blocks))
	for _, b := range p.Blocks {
		idx[b.ID] = len(out.Blocks)
		out.Blocks = append(out.Blocks, ProgramBlockResponse{
			ID:       b.ID,
			Sequence: b.Sequence,
			Name:     b.Name,
			Weeks:    make([]ProgramWeekResponse, 0),
		})
	}
	for _, w := range p.Weeks {
		if i, ok := idx[w.ProgramBlockID]; ok {
			out.Blocks[i].Weeks = append(out.Blocks[i].Weeks, mapWeek(w, names))
		}
	}
	return out
}

func mapWeek(w generated.ProgramWeek, names map[uuid.UUID]string) ProgramWeekResponse {
	out := ProgramWeekResponse{
		ID:       w.ID,
		Sequence: w.Sequence,
		Name:     w.Name,
		Days:     make([]ProgramDayResponse, 0, len(w.Days)),
	}
	for _, d := range w.Days {
		out.Days = append(out.Days, mapDay(d, names))
	}
	return out
}

func mapDay(d generated.ProgramDay, names map[uuid.UUID]string) ProgramDayResponse {
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

func mapExercise(e generated.ProgramExercise, names map[uuid.UUID]string) ProgramExerciseResponse {
	out := ProgramExerciseResponse{
		ID:           e.ID,
		Sequence:     e.Sequence,
		ExerciseID:   e.ExerciseID,
		ExerciseName: names[e.ExerciseID],
		SubText:      e.SubText,
		RestSeconds:  e.RestSeconds,
		Groups:       make([]ProgramSetGroupResponse, 0, len(e.Groups)),
	}
	for _, g := range e.Groups {
		out.Groups = append(out.Groups, mapGroup(g))
	}
	return out
}

func mapGroup(g generated.ProgramSetGroup) ProgramSetGroupResponse {
	out := ProgramSetGroupResponse{
		ID:       g.ID,
		Sequence: g.Sequence,
		Sets:     make([]ProgramSetResponse, 0, len(g.Sets)),
	}
	for _, s := range g.Sets {
		out.Sets = append(out.Sets, mapSet(s))
	}
	return out
}

func mapSet(s generated.ProgramSet) ProgramSetResponse {
	return ProgramSetResponse{
		ID:                     s.ID,
		Sequence:               s.Sequence,
		SetType:                s.SetType,
		RepsMin:                s.RepsMin,
		RepsMax:                s.RepsMax,
		IntensityText:          s.IntensityText,
		PrescribedLoadKg:       s.PrescribedLoadKg,
		PrescribedLoadModifier: s.PrescribedLoadModifier,
		CapLoadKg:              s.CapLoadKg,
		PrescribedRpe:          s.PrescribedRpe,
	}
}
