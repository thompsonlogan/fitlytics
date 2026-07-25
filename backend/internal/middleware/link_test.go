package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

type fakeLinkChecker struct {
	participant bool
	err         error
	lastLink    uuid.UUID
	lastUser    uuid.UUID
}

func (f *fakeLinkChecker) IsLinkParticipant(_ context.Context, linkID, userID uuid.UUID) (bool, error) {
	f.lastLink, f.lastUser = linkID, userID
	return f.participant, f.err
}

func newLinkEngine(caller uuid.UUID, checker LinkParticipantChecker) (*gin.Engine, *bool) {
	gin.SetMode(gin.TestMode)

	reached := false
	r := gin.New()
	r.Use(func(c *gin.Context) {
		auth.SetPrincipal(c, &auth.Principal{User: &generated.User{ID: caller}})
		c.Next()
	})
	r.GET("/links/:linkId/notes", RequireLinkParticipant(checker, quietLog()), func(c *gin.Context) {
		reached = true
		c.Status(http.StatusOK)
	})
	return r, &reached
}

func getLink(r *gin.Engine, linkID string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/links/"+linkID+"/notes", nil))
	return w
}

func TestRequireLinkParticipant_MemberPasses(t *testing.T) {
	checker := &fakeLinkChecker{participant: true}
	caller, link := uuid.New(), uuid.New()
	r, reached := newLinkEngine(caller, checker)

	if w := getLink(r, link.String()); w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	if !*reached {
		t.Error("handler should have run")
	}
	if checker.lastLink != link || checker.lastUser != caller {
		t.Errorf("ids must reach the checker unswapped: link=%v user=%v", checker.lastLink, checker.lastUser)
	}
}

func TestRequireLinkParticipant_NonMemberIsNotFound(t *testing.T) {
	r, reached := newLinkEngine(uuid.New(), &fakeLinkChecker{participant: false})

	if w := getLink(r, uuid.NewString()); w.Code != http.StatusNotFound {
		t.Errorf("want 404, got %d", w.Code)
	}
	if *reached {
		t.Error("handler must not run for a non-member")
	}
}

func TestRequireLinkParticipant_MalformedIDIsBadRequest(t *testing.T) {
	checker := &fakeLinkChecker{participant: true}
	r, reached := newLinkEngine(uuid.New(), checker)

	if w := getLink(r, "not-a-uuid"); w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
	if *reached {
		t.Error("handler must not run")
	}
	if checker.lastLink != uuid.Nil {
		t.Error("a malformed id must not reach the database")
	}
}

func TestRequireLinkParticipant_CheckFailureIsInternalError(t *testing.T) {
	r, reached := newLinkEngine(uuid.New(),
		&fakeLinkChecker{err: errors.New("connection refused")})

	if w := getLink(r, uuid.NewString()); w.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", w.Code)
	}
	if *reached {
		t.Error("handler must not run")
	}
}
