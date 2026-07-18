package coaching

import (
	"time"

	"github.com/google/uuid"
)

func mapLinks(rows []Link, callerID uuid.UUID) []CoachLinkResponse {
	out := make([]CoachLinkResponse, len(rows))

	for i, row := range rows {
		side, counterpartID, counterpartName := SideAthlete, row.CoachUserID, row.CoachName
		if row.CoachUserID == callerID {
			side, counterpartID, counterpartName = SideCoach, row.AthleteUserID, row.AthleteName
		}

		out[i] = CoachLinkResponse{
			LinkID:            row.LinkID,
			CounterpartUserID: counterpartID,
			CounterpartName:   counterpartName,
			Side:              side,
			Status:            row.Status,
		}
	}

	return out
}

func mapNote(row NoteWithAuthor) CoachNoteResponse {
	return CoachNoteResponse{
		ID:           row.Note.ID,
		AuthorUserID: row.Note.AuthorUserID,
		AuthorName:   row.AuthorName,
		Body:         row.Note.Body,
		SetVideoID:   row.Note.SetVideoID,
		CreatedAt:    row.Note.CreatedAt,
	}
}

func mapNotes(rows []NoteWithAuthor) []CoachNoteResponse {
	out := make([]CoachNoteResponse, len(rows))
	for i, row := range rows {
		out[i] = mapNote(row)
	}
	return out
}

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
			LinkID:        a.LinkID,
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
