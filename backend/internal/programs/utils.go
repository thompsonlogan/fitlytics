package programs

import (
	"cmp"
	"slices"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func collectExerciseIDs(p *generated.Program) []uuid.UUID {
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

func sortProgramTree(p *generated.Program) {
	slices.SortFunc(p.Blocks, func(a, b generated.ProgramBlock) int {
		return cmp.Compare(a.Sequence, b.Sequence)
	})
	slices.SortFunc(p.Weeks, func(a, b generated.ProgramWeek) int {
		return cmp.Compare(a.Sequence, b.Sequence)
	})
	for i := range p.Weeks {
		slices.SortFunc(p.Weeks[i].Days, func(a, b generated.ProgramDay) int {
			return cmp.Compare(a.Sequence, b.Sequence)
		})
		for j := range p.Weeks[i].Days {
			slices.SortFunc(p.Weeks[i].Days[j].Exercises, func(a, b generated.ProgramExercise) int {
				return cmp.Compare(a.Sequence, b.Sequence)
			})
			for k := range p.Weeks[i].Days[j].Exercises {
				ex := &p.Weeks[i].Days[j].Exercises[k]
				slices.SortFunc(ex.Groups, func(a, b generated.ProgramSetGroup) int {
					return cmp.Compare(a.Sequence, b.Sequence)
				})
				for g := range ex.Groups {
					slices.SortFunc(ex.Groups[g].Sets, func(a, b generated.ProgramSet) int {
						return cmp.Compare(a.Sequence, b.Sequence)
					})
				}
			}
		}
	}
}
