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

type fakeVideoRepo struct {
	sessionOwner uuid.UUID
	videoOwner   uuid.UUID
	err          error
}

func (f *fakeVideoRepo) GetSessionOwner(context.Context, uuid.UUID) (uuid.UUID, error) {
	return f.sessionOwner, f.err
}

func (f *fakeVideoRepo) GetVideoOwner(context.Context, uuid.UUID) (uuid.UUID, error) {
	return f.videoOwner, f.err
}

func newGuardEngine(caller uuid.UUID, param string, guard gin.HandlerFunc) (*gin.Engine, *uuid.UUID) {
	gin.SetMode(gin.TestMode)

	var seen uuid.UUID
	r := gin.New()
	r.Use(func(c *gin.Context) {
		auth.SetPrincipal(c, &auth.Principal{User: &generated.User{ID: caller}})
		c.Next()
	})
	r.GET("/probe/:"+param, guard, func(c *gin.Context) {
		seen = MustResourceOwner(c)
		c.Status(http.StatusOK)
	})
	return r, &seen
}

func probe(r *gin.Engine, id string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/probe/"+id, nil))
	return w
}

func quietLog() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// ─── RequireSessionRead ─────────────────────────────────────────────────────

func TestRequireSessionRead_OwnerAndLinkedCoachBothPass(t *testing.T) {
	athlete, coach := uuid.New(), uuid.New()
	repo := &fakeVideoRepo{sessionOwner: athlete}

	for _, tc := range []struct {
		name    string
		caller  uuid.UUID
		coaches access.CoachChecker
	}{
		{"owner", athlete, fakeCoaches{}},
		{"linked coach", coach, fakeCoaches{linked: true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r, seen := newGuardEngine(tc.caller, "sessionId",
				RequireSessionRead(repo, access.NewChecker(tc.coaches), quietLog()))

			if w := probe(r, uuid.NewString()); w.Code != http.StatusOK {
				t.Fatalf("want 200, got %d", w.Code)
			}

			if *seen != athlete {
				t.Errorf("handler should receive the athlete %v, got %v", athlete, *seen)
			}
		})
	}
}

func TestRequireSessionRead_StrangerIsNotFound(t *testing.T) {
	repo := &fakeVideoRepo{sessionOwner: uuid.New()}
	r, _ := newGuardEngine(uuid.New(), "sessionId",
		RequireSessionRead(repo, access.NewChecker(fakeCoaches{}), quietLog()))

	if w := probe(r, uuid.NewString()); w.Code != http.StatusNotFound {
		t.Errorf("want 404, got %d", w.Code)
	}
}

func TestRequireSessionRead_MissingSessionIsNotFound(t *testing.T) {
	repo := &fakeVideoRepo{err: gorm.ErrRecordNotFound}
	r, _ := newGuardEngine(uuid.New(), "sessionId",
		RequireSessionRead(repo, access.NewChecker(fakeCoaches{}), quietLog()))

	if w := probe(r, uuid.NewString()); w.Code != http.StatusNotFound {
		t.Errorf("want 404, got %d", w.Code)
	}
}

// ─── RequireVideoReviewer ───────────────────────────────────────────────────

func TestRequireVideoReviewer_OwnerIsRejected(t *testing.T) {
	athlete := uuid.New()
	repo := &fakeVideoRepo{videoOwner: athlete}

	r, _ := newGuardEngine(athlete, "videoId",
		RequireVideoReviewer(repo, access.NewChecker(fakeCoaches{}), quietLog()))

	if w := probe(r, uuid.NewString()); w.Code != http.StatusNotFound {
		t.Errorf("an athlete must not review their own video; want 404, got %d", w.Code)
	}
}

func TestRequireVideoReviewer_LinkedCoachPasses(t *testing.T) {
	athlete, coach := uuid.New(), uuid.New()
	repo := &fakeVideoRepo{videoOwner: athlete}

	r, seen := newGuardEngine(coach, "videoId",
		RequireVideoReviewer(repo, access.NewChecker(fakeCoaches{linked: true}), quietLog()))

	if w := probe(r, uuid.NewString()); w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	if *seen != athlete {
		t.Errorf("handler should receive the athlete %v, got %v", athlete, *seen)
	}
}

func TestRequireVideoReviewer_SelfCoachPasses(t *testing.T) {
	self := uuid.New()
	repo := &fakeVideoRepo{videoOwner: self}

	r, _ := newGuardEngine(self, "videoId",
		RequireVideoReviewer(repo, access.NewChecker(fakeCoaches{linked: true}), quietLog()))

	if w := probe(r, uuid.NewString()); w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
}

func TestRequireVideoReviewer_LinkCheckFailureIsInternalError(t *testing.T) {
	repo := &fakeVideoRepo{videoOwner: uuid.New()}
	coaches := fakeCoaches{err: errors.New("connection refused")}

	r, _ := newGuardEngine(uuid.New(), "videoId",
		RequireVideoReviewer(repo, access.NewChecker(coaches), quietLog()))

	if w := probe(r, uuid.NewString()); w.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", w.Code)
	}
}
