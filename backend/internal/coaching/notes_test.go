package coaching

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

var linkID = fixedID("link:1")

func notesService(repo Repository) Service {
	return NewService(repo)
}

// ─── link presentation ──────────────────────────────────────────────────────

func TestListLinks_PresentsTheCounterpartFromEachSide(t *testing.T) {
	row := Link{
		LinkID:        linkID,
		CoachUserID:   coachID,
		AthleteUserID: athleteID,
		CoachName:     "Dana Kim",
		AthleteName:   "Marcus Webb",
		Status:        StatusActive,
	}
	repo := &fakeRepository{
		listLinksFn: func(context.Context, uuid.UUID) ([]Link, error) { return []Link{row}, nil },
	}

	for _, tc := range []struct {
		name            string
		caller          uuid.UUID
		wantSide        string
		wantCounterpart string
		wantCounterID   uuid.UUID
	}{
		{"as the coach", coachID, SideCoach, "Marcus Webb", athleteID},
		{"as the athlete", athleteID, SideAthlete, "Dana Kim", coachID},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := notesService(repo).ListLinks(context.Background(), tc.caller)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != 1 {
				t.Fatalf("want 1 link, got %d", len(got))
			}
			if got[0].Side != tc.wantSide {
				t.Errorf("side: want %q, got %q", tc.wantSide, got[0].Side)
			}
			if got[0].CounterpartName != tc.wantCounterpart {
				t.Errorf("counterpart: want %q, got %q", tc.wantCounterpart, got[0].CounterpartName)
			}
			if got[0].CounterpartUserID != tc.wantCounterID {
				t.Errorf("counterpart id: want %v, got %v", tc.wantCounterID, got[0].CounterpartUserID)
			}
		})
	}
}
func TestListLinks_SelfCoachingReadsAsCoach(t *testing.T) {
	repo := &fakeRepository{
		listLinksFn: func(context.Context, uuid.UUID) ([]Link, error) {
			return []Link{{
				LinkID: linkID, CoachUserID: coachID, AthleteUserID: coachID,
				CoachName: "Dana Kim", AthleteName: "Dana Kim", Status: StatusActive,
			}}, nil
		},
	}

	got, err := notesService(repo).ListLinks(context.Background(), coachID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].Side != SideCoach || got[0].CounterpartUserID != coachID {
		t.Errorf("self-link should read as coach over themselves, got %+v", got[0])
	}
}

// ─── posting ────────────────────────────────────────────────────────────────

func TestCreateNote_TrimsAndStores(t *testing.T) {
	repo := &fakeRepository{}

	got, err := notesService(repo).CreateNote(context.Background(), linkID, coachID,
		CreateCoachNoteRequest{Body: "  Hips rise early.  "})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if repo.createdNote.Body != "Hips rise early." {
		t.Errorf("body should be trimmed, got %q", repo.createdNote.Body)
	}
	if repo.createdNote.CoachAthleteID != linkID || repo.createdNote.AuthorUserID != coachID {
		t.Errorf("note should be attributed to the link and author: %+v", repo.createdNote)
	}
	if got.AuthorName == "" {
		t.Error("response should carry the author's name for rendering the thread")
	}
}

func TestCreateNote_RejectsEmptyBody(t *testing.T) {
	for _, body := range []string{"", "   ", "\n\t"} {
		repo := &fakeRepository{}

		_, err := notesService(repo).CreateNote(context.Background(), linkID, coachID,
			CreateCoachNoteRequest{Body: body})

		if !errors.Is(err, apierr.ErrInvalidInput) {
			t.Errorf("body %q: want ErrInvalidInput, got %v", body, err)
		}
		if repo.createdNote != nil {
			t.Error("an empty note must not be written")
		}
	}
}

func TestCreateNote_RejectsOverlongBody(t *testing.T) {
	repo := &fakeRepository{}

	_, err := notesService(repo).CreateNote(context.Background(), linkID, coachID,
		CreateCoachNoteRequest{Body: strings.Repeat("x", maxNoteChars+1)})

	if !errors.Is(err, apierr.ErrInvalidInput) {
		t.Errorf("want ErrInvalidInput, got %v", err)
	}
	if repo.createdNote != nil {
		t.Error("an overlong note must not be written")
	}
}

// ─── video attachment ───────────────────────────────────────────────────────

func TestCreateNote_WithoutVideoSkipsTheOwnershipCheck(t *testing.T) {
	repo := &fakeRepository{}

	if _, err := notesService(repo).CreateNote(context.Background(), linkID, coachID,
		CreateCoachNoteRequest{Body: "no video here"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.videoOwnerChecks != 0 {
		t.Error("a note with no video should not query video ownership")
	}
}

func TestCreateNote_AttachedVideoMustBelongToTheAthlete(t *testing.T) {
	videoID := fixedID("video:stranger")
	repo := &fakeRepository{
		videoBelongsToFn: func(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
			return false, nil
		},
	}

	_, err := notesService(repo).CreateNote(context.Background(), linkID, coachID,
		CreateCoachNoteRequest{Body: "nice rep", SetVideoID: &videoID})

	if !errors.Is(err, apierr.ErrInvalidInput) {
		t.Errorf("want ErrInvalidInput, got %v", err)
	}
	if repo.createdNote != nil {
		t.Error("the note must not be written when the video is not the athlete's")
	}
}

func TestCreateNote_AttachedVideoIsCheckedAgainstTheAthleteNotTheAuthor(t *testing.T) {
	videoID := fixedID("video:1")
	var checkedAgainst uuid.UUID

	repo := &fakeRepository{
		videoBelongsToFn: func(_ context.Context, _, userID uuid.UUID) (bool, error) {
			checkedAgainst = userID
			return true, nil
		},
	}

	if _, err := notesService(repo).CreateNote(context.Background(), linkID, coachID,
		CreateCoachNoteRequest{Body: "nice rep", SetVideoID: &videoID}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if checkedAgainst != athleteID {
		t.Errorf("video ownership should be checked against the athlete %v, got %v", athleteID, checkedAgainst)
	}
}

func TestCreateNote_MissingLinkIsNotFound(t *testing.T) {
	videoID := fixedID("video:1")
	repo := &fakeRepository{
		getLinkFn: func(context.Context, uuid.UUID) (*generated.CoachAthlete, error) {
			return nil, gorm.ErrRecordNotFound
		},
	}

	_, err := notesService(repo).CreateNote(context.Background(), linkID, coachID,
		CreateCoachNoteRequest{Body: "hello", SetVideoID: &videoID})

	if !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

// ─── reading ────────────────────────────────────────────────────────────────

func TestListNotes_CarriesAuthorship(t *testing.T) {
	repo := &fakeRepository{
		listNotesFn: func(context.Context, uuid.UUID) ([]NoteWithAuthor, error) {
			return []NoteWithAuthor{
				{Note: generated.CoachNote{Body: "from the coach", AuthorUserID: coachID}, AuthorName: "Dana Kim"},
				{Note: generated.CoachNote{Body: "from the athlete", AuthorUserID: athleteID}, AuthorName: "Marcus Webb"},
			}, nil
		},
	}

	got, err := notesService(repo).ListNotes(context.Background(), linkID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 notes, got %d", len(got))
	}
	if got[0].AuthorName != "Dana Kim" || got[1].AuthorName != "Marcus Webb" {
		t.Errorf("authorship not carried through: %+v", got)
	}
}
