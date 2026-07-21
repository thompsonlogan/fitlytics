package middleware

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/access"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

type fakeOwnerResolver struct {
	owner uuid.UUID
	err   error
	calls int
}

func (f *fakeOwnerResolver) GetProgramOwner(context.Context, uuid.UUID) (uuid.UUID, error) {
	f.calls++
	return f.owner, f.err
}

type fakeCoaches struct {
	linked bool
	err    error
}

func (f fakeCoaches) IsActiveCoach(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return f.linked, f.err
}

func newProgramReadEngine(caller uuid.UUID, resolver ProgramOwnerResolver, coaches access.CoachChecker) (*gin.Engine, *uuid.UUID) {
	gin.SetMode(gin.TestMode)

	var seen uuid.UUID
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	r := gin.New()
	r.Use(func(c *gin.Context) {
		// Callers here carry the Coach role; the role-gate denial is covered
		// separately by TestRequireProgramRead_LinkedButNotCoachIsDenied.
		auth.SetPrincipal(c, &auth.Principal{
			User:   &generated.User{ID: caller},
			Claims: &auth.Claims{Role: auth.RoleCoach},
		})
		c.Next()
	})
	r.GET("/programs/:id", RequireProgramRead(resolver, access.NewChecker(coaches), log), func(c *gin.Context) {
		seen = MustResourceOwner(c)
		c.Status(http.StatusOK)
	})
	return r, &seen
}

func get(r *gin.Engine, programID string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/programs/"+programID, nil))
	return w
}

func TestRequireProgramRead_OwnerReadsTheirOwn(t *testing.T) {
	owner := uuid.New()
	r, seen := newProgramReadEngine(owner, &fakeOwnerResolver{owner: owner}, fakeCoaches{})

	if w := get(r, uuid.NewString()); w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	if *seen != owner {
		t.Errorf("handler should receive the owner %v, got %v", owner, *seen)
	}
}

func TestRequireProgramRead_LinkedCoachReceivesTheAthleteAsOwner(t *testing.T) {
	coach, athlete := uuid.New(), uuid.New()
	r, seen := newProgramReadEngine(coach, &fakeOwnerResolver{owner: athlete}, fakeCoaches{linked: true})

	if w := get(r, uuid.NewString()); w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	if *seen != athlete {
		t.Errorf("handler should receive the athlete %v, got %v", athlete, *seen)
	}
}

func TestRequireProgramRead_StrangerIsNotFound(t *testing.T) {
	r, _ := newProgramReadEngine(uuid.New(), &fakeOwnerResolver{owner: uuid.New()}, fakeCoaches{linked: false})

	w := get(r, uuid.NewString())

	if w.Code != http.StatusNotFound {
		t.Errorf("want 404, got %d", w.Code)
	}
	if body := w.Body.String(); body == "" {
		t.Error("expected a problem-details body")
	}
}

// A caller with a live link but no Coach token role must be denied — the
// guarded routes sit under RequireAuth, not RequireRole, so the role is the
// only thing standing between "placed in coach_user_id" and reading another
// user's program. 404, not 403, so the program's existence stays hidden.
func TestRequireProgramRead_LinkedButNotCoachIsDenied(t *testing.T) {
	coach, athlete := uuid.New(), uuid.New()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	r := gin.New()
	r.Use(func(c *gin.Context) {
		auth.SetPrincipal(c, &auth.Principal{
			User:   &generated.User{ID: coach},
			Claims: &auth.Claims{}, // authenticated, but no Coach role
		})
		c.Next()
	})
	r.GET("/programs/:id",
		RequireProgramRead(&fakeOwnerResolver{owner: athlete}, access.NewChecker(fakeCoaches{linked: true}), log),
		func(c *gin.Context) { c.Status(http.StatusOK) })

	if w := get(r, uuid.NewString()); w.Code != http.StatusNotFound {
		t.Errorf("want 404 for a linked non-coach, got %d", w.Code)
	}
}

func TestRequireProgramRead_MissingProgramIsNotFound(t *testing.T) {
	r, _ := newProgramReadEngine(uuid.New(),
		&fakeOwnerResolver{err: gorm.ErrRecordNotFound}, fakeCoaches{})

	if w := get(r, uuid.NewString()); w.Code != http.StatusNotFound {
		t.Errorf("want 404, got %d", w.Code)
	}
}

func TestRequireProgramRead_MalformedIDIsBadRequest(t *testing.T) {
	resolver := &fakeOwnerResolver{owner: uuid.New()}
	r, _ := newProgramReadEngine(uuid.New(), resolver, fakeCoaches{})

	if w := get(r, "not-a-uuid"); w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
	if resolver.calls != 0 {
		t.Error("a malformed id must not reach the database")
	}
}

func TestRequireProgramRead_ResolverFailureIsInternalError(t *testing.T) {
	r, _ := newProgramReadEngine(uuid.New(),
		&fakeOwnerResolver{err: errors.New("connection refused")}, fakeCoaches{})

	if w := get(r, uuid.NewString()); w.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", w.Code)
	}
}

func TestRequireProgramRead_LinkCheckFailureIsInternalError(t *testing.T) {
	r, _ := newProgramReadEngine(uuid.New(),
		&fakeOwnerResolver{owner: uuid.New()},
		fakeCoaches{err: errors.New("connection refused")})

	if w := get(r, uuid.NewString()); w.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", w.Code)
	}
}

func TestMustResourceOwner_PanicsWithoutTheGuard(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("expected a panic when no guard has run")
		}
	}()

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	MustResourceOwner(c)
}
