package sessions

import (
	"github.com/thompsonlogan/fitlytics/backend/internal/models"
)

// Pure model → DTO mappers, kept in this file so service.go stays focused on
// orchestration.

func mapSession(s *models.Session) *SessionResponse {
	out := &SessionResponse{
		ID:              s.ID,
		UserID:          s.UserID,
		ProgramDayID:    s.ProgramDayID,
		ProgramNameSnap: s.ProgramNameSnap,
		DayNameSnap:     s.DayNameSnap,
		State:           s.State,
		StartedAt:       s.StartedAt,
		CompletedAt:     s.CompletedAt,
		Exercises:       make([]SessionExerciseResponse, 0, len(s.Exercises)),
	}
	for _, e := range s.Exercises {
		out.Exercises = append(out.Exercises, mapSessionExercise(e))
	}
	return out
}

func mapSessionExercise(e models.SessionExercise) SessionExerciseResponse {
	out := SessionExerciseResponse{
		ID:               e.ID,
		Sequence:         e.Sequence,
		ExerciseID:       e.ExerciseID,
		ExerciseNameSnap: e.ExerciseNameSnap,
		SubSnap:          e.SubSnap,
		RestSecondsSnap:  e.RestSecondsSnap,
		SetLogs:          make([]SetLogResponse, 0, len(e.SetLogs)),
	}
	for _, l := range e.SetLogs {
		out.SetLogs = append(out.SetLogs, mapSetLog(l))
	}
	return out
}

func mapSetLog(l models.SetLog) SetLogResponse {
	return SetLogResponse{
		ID:                     l.ID,
		Sequence:               l.Sequence,
		SetType:                l.SetType,
		RepsTargetMin:          l.RepsTargetMin,
		RepsTargetMax:          l.RepsTargetMax,
		PrescribedLoadKg:       l.PrescribedLoadKg,
		PrescribedLoadModifier: l.PrescribedLoadModifier,
		PrescribedRpe:          l.PrescribedRpe,
		IntensityText:          l.IntensityText,
		RepsActual:             l.RepsActual,
		ActualLoadKg:           l.ActualLoadKg,
		ActualLoadModifier:     l.ActualLoadModifier,
		ActualRpe:              l.ActualRpe,
		State:                  l.State,
	}
}
