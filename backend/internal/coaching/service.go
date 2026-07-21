package coaching

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

const metricsWindowDays = 28
const attentionCompliancePct = 80
const maxNoteChars = 4000
const defaultNotesLimit = 50
const maxNotesLimit = 100

type Service interface {
	GetRoster(ctx context.Context, coachID uuid.UUID) ([]CoachAthleteSummaryResponse, error)
	ListLinks(ctx context.Context, userID uuid.UUID) ([]CoachLinkResponse, error)
	ListNotes(ctx context.Context, linkID uuid.UUID, limit int) ([]CoachNoteResponse, error)
	CreateNote(ctx context.Context, linkID, authorID uuid.UUID, in CreateCoachNoteRequest) (*CoachNoteResponse, error)
}

type service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) Service {
	return &service{repo: repo, now: time.Now}
}

func (s *service) GetRoster(ctx context.Context, coachID uuid.UUID) ([]CoachAthleteSummaryResponse, error) {
	athletes, err := s.repo.ListActiveAthletes(ctx, coachID)
	if err != nil {
		return nil, fmt.Errorf("list athletes: %w", err)
	}
	if len(athletes) == 0 {
		return []CoachAthleteSummaryResponse{}, nil
	}

	ids := make([]uuid.UUID, len(athletes))
	for i, a := range athletes {
		ids[i] = a.AthleteUserID
	}

	now := s.now()
	since := now.AddDate(0, 0, -metricsWindowDays)

	programs, err := s.repo.LatestProgramByUser(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("load programs: %w", err)
	}

	programIDs := make([]uuid.UUID, 0, len(programs))
	for _, p := range programs {
		programIDs = append(programIDs, p.ProgramID)
	}
	schedules, err := s.repo.ScheduledDaysByProgram(ctx, programIDs)
	if err != nil {
		return nil, fmt.Errorf("load schedules: %w", err)
	}

	metrics, err := s.repo.MetricsByUser(ctx, ids, programIDs, since)
	if err != nil {
		return nil, fmt.Errorf("load metrics: %w", err)
	}
	videos, err := s.repo.UnreviewedVideoCountByUser(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("count videos: %w", err)
	}

	return mapRoster(athletes, programs, schedules, metrics, videos, since, now), nil
}

func (s *service) ListLinks(ctx context.Context, userID uuid.UUID) ([]CoachLinkResponse, error) {
	rows, err := s.repo.ListLinksForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list links: %w", err)
	}
	return mapLinks(rows, userID), nil
}

func (s *service) ListNotes(ctx context.Context, linkID uuid.UUID, limit int) ([]CoachNoteResponse, error) {
	if limit <= 0 || limit > maxNotesLimit {
		limit = defaultNotesLimit
	}
	rows, err := s.repo.ListNotes(ctx, linkID, limit)
	if err != nil {
		return nil, fmt.Errorf("list notes: %w", err)
	}
	return mapNotes(rows), nil
}

func (s *service) CreateNote(ctx context.Context, linkID, authorID uuid.UUID, in CreateCoachNoteRequest) (*CoachNoteResponse, error) {
	body := strings.TrimSpace(in.Body)
	switch {
	case body == "":
		return nil, fmt.Errorf("%w: body is required", apierr.ErrInvalidInput)
	case len([]rune(body)) > maxNoteChars:
		return nil, fmt.Errorf("%w: body exceeds %d characters", apierr.ErrInvalidInput, maxNoteChars)
	}

	if in.SetVideoID != nil {
		if err := s.verifyVideoInThread(ctx, linkID, *in.SetVideoID); err != nil {
			return nil, err
		}
	}

	row, err := s.repo.CreateNote(ctx, &generated.CoachNote{
		CoachAthleteID: linkID,
		AuthorUserID:   authorID,
		Body:           body,
		SetVideoID:     in.SetVideoID,
	})
	if err != nil {
		return nil, fmt.Errorf("create note: %w", err)
	}

	resp := mapNote(*row)
	return &resp, nil
}

func (s *service) verifyVideoInThread(ctx context.Context, linkID, videoID uuid.UUID) error {
	link, err := s.repo.GetLink(ctx, linkID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apierr.ErrNotFound
		}
		return fmt.Errorf("load link: %w", err)
	}

	ok, err := s.repo.VideoBelongsTo(ctx, videoID, link.AthleteUserID)
	if err != nil {
		return fmt.Errorf("verify video: %w", err)
	}
	if !ok {
		return fmt.Errorf("%w: video does not belong to this athlete", apierr.ErrInvalidInput)
	}
	return nil
}

func dueSessions(p RosterProgram, days []ScheduledDay, since, now time.Time) int64 {
	if p.StartDate == nil {
		return 0
	}

	var due int64
	for _, d := range days {
		if d.IsRestDay {
			continue
		}
		date := p.StartDate.AddDate(0, 0, int(d.WeekSequence-1)*7+int(d.DaySequence-1))
		if !date.Before(since) && !date.After(now) {
			due++
		}
	}
	return due
}

func compliancePct(completed, due int64) *int32 {
	if due <= 0 {
		return nil
	}

	pct := int32(math.Round(float64(completed) / float64(due) * 100))
	if pct > 100 {
		pct = 100
	}
	return &pct
}

func deriveStatus(hasSessions bool, compliance *int32) string {
	switch {
	case !hasSessions:
		return AthleteStatusNew
	case compliance != nil && *compliance < attentionCompliancePct:
		return AthleteStatusAttention
	default:
		return AthleteStatusOnTrack
	}
}

func currentWeek(p RosterProgram, now time.Time) int32 {
	if p.WeekCount <= 0 {
		return 0
	}
	if p.StartDate == nil {
		return 1
	}

	days := int32(now.Sub(*p.StartDate).Hours() / 24)
	if days < 0 {
		return 1
	}

	week := days/7 + 1
	if week > p.WeekCount {
		return p.WeekCount
	}
	return week
}
