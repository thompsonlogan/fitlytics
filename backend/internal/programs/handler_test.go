package programs

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/models"
)

func init() {
	// Suppress gin's default logging in tests — we don't care about it and
	// it pollutes test output.
	gin.SetMode(gin.TestMode)
}

// newTestContext returns a gin Context wired up like the real /api group:
// auth middleware has already run, so the principal is attached. The :id
// param is whatever you pass in idParam.
func newTestContext(t *testing.T, principalUserID uuid.UUID, idParam string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/programs/"+idParam, nil)
	c.Params = gin.Params{gin.Param{Key: "id", Value: idParam}}

	auth.SetPrincipal(c, &auth.Principal{
		User: &models.User{ID: principalUserID},
	})
	return c, w
}

// silentLogger discards everything — handler error logs would otherwise hit
// stderr during the "happy path of failure" cases.
func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestHandlerGetByID_InvalidUUIDReturns400(t *testing.T) {
	h := NewHandler(&fakeService{}, silentLogger())
	c, w := newTestContext(t, uuid.New(), "not-a-uuid")

	h.GetByID(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", w.Code)
	}
	var body ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestHandlerGetByID_ServiceNotFoundReturns404(t *testing.T) {
	svc := &fakeService{
		getFullTreeFn: func(_ context.Context, _, _ uuid.UUID) (*ProgramResponse, error) {
			return nil, ErrNotFound
		},
	}
	c, w := newTestContext(t, uuid.New(), uuid.NewString())

	NewHandler(svc, silentLogger()).GetByID(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status: want 404, got %d", w.Code)
	}
	var body ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != "program not found" {
		t.Errorf("error message: want %q, got %q", "program not found", body.Error)
	}
}

func TestHandlerGetByID_GenericServiceErrorReturns500(t *testing.T) {
	svc := &fakeService{
		getFullTreeFn: func(_ context.Context, _, _ uuid.UUID) (*ProgramResponse, error) {
			return nil, errors.New("kaboom")
		},
	}
	c, w := newTestContext(t, uuid.New(), uuid.NewString())

	NewHandler(svc, silentLogger()).GetByID(c)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status: want 500, got %d", w.Code)
	}
	var body ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	// Don't leak the underlying error message to the client.
	if body.Error != "internal server error" {
		t.Errorf("error message: want %q, got %q", "internal server error", body.Error)
	}
}

func TestHandlerGetByID_SuccessReturns200WithJSON(t *testing.T) {
	userID := uuid.New()
	programID := uuid.New()

	want := &ProgramResponse{
		ID:    programID,
		Name:  "Sample",
		Weeks: []ProgramWeekResponse{},
	}

	var gotProgramID, gotOwnerID uuid.UUID
	svc := &fakeService{
		getFullTreeFn: func(_ context.Context, pid, oid uuid.UUID) (*ProgramResponse, error) {
			gotProgramID, gotOwnerID = pid, oid
			return want, nil
		},
	}

	c, w := newTestContext(t, userID, programID.String())
	NewHandler(svc, silentLogger()).GetByID(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	if gotProgramID != programID {
		t.Errorf("program id passed to service: want %v, got %v", programID, gotProgramID)
	}
	// Ownership filter: the handler must pass the principal's id, not anything
	// from the request. This is the auth boundary — if it ever regresses,
	// users could read other users' programs.
	if gotOwnerID != userID {
		t.Errorf("owner id passed to service: want %v (principal), got %v", userID, gotOwnerID)
	}

	var body ProgramResponse
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.ID != programID || body.Name != "Sample" {
		t.Errorf("response body did not match service output: %+v", body)
	}
}

func TestHandlerRegisterMountsRoute(t *testing.T) {
	// Belt-and-suspenders test: confirm the path string the handler registers
	// matches the documented route. A typo here would otherwise only be caught
	// by a hand test of the live server.
	r := gin.New()
	g := r.Group("/api")

	svc := &fakeService{
		getFullTreeFn: func(_ context.Context, _, _ uuid.UUID) (*ProgramResponse, error) {
			return &ProgramResponse{ID: uuid.New()}, nil
		},
	}

	h := NewHandler(svc, silentLogger())

	// We can't reach MustPrincipal through plain router invocation without
	// also wiring the auth middleware, so add a stub middleware that sets
	// the principal — this mirrors the real production wiring.
	g.Use(func(c *gin.Context) {
		auth.SetPrincipal(c, &auth.Principal{User: &models.User{ID: uuid.New()}})
		c.Next()
	})
	h.Register(g)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/programs/"+uuid.NewString(), nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected route to be reachable; got status %d (body=%s)", w.Code, w.Body.String())
	}
}
