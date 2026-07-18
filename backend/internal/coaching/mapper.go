package coaching

import (
	"time"

	"github.com/google/uuid"
)

func mapRoster(
	athletes []RosterAthlete,
	programs map[uuid.UUID]RosterProgram,
	schedules map[uuid.UUID][]ScheduledDay,
	metrics map[uuid.UUID]RosterMetrics,
	videos map[uuid.UUID]int64,
	since time.Time,
	now time.Time,
) []CoachAthleteSummaryResponse {
	out := make([]CoachAthleteSummaryResponse, len(athletes))

	for i, a := range athletes {
		m := metrics[a.AthleteUserID]

		row := CoachAthleteSummaryResponse{
			AthleteUserID: a.AthleteUserID,
			DisplayName:   a.DisplayName,
			Email:         a.Email,
			AvgRpe:        m.AvgRpe,
			LastSessionAt: m.LastSessionAt,
			VideosWaiting: videos[a.AthleteUserID],
		}

		if p, ok := programs[a.AthleteUserID]; ok {
			due := dueSessions(p, schedules[p.ProgramID], since, now)

			row.ProgramID = &p.ProgramID
			row.ProgramName = &p.ProgramName
			row.TotalWeeks = p.WeekCount
			row.CurrentWeek = currentWeek(p, now)
			row.SessionsDue = due
			row.SessionsCompleted = m.CompletedSessions
			row.CompliancePct = compliancePct(m.CompletedSessions, due)
		}

		row.Status = deriveStatus(m.LastSessionAt != nil, row.CompliancePct)
		out[i] = row
	}

	return out
}
