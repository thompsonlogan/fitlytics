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
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
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
		User: &generated.User{ID: principalUserID},
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

// ─── List ───────────────────────────────────────────────────────────────────

// newListTestContext mirrors newTestContext but targets the list endpoint
// (no :id param required).
func newListTestContext(t *testing.T, principalUserID uuid.UUID) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/programs", nil)
	auth.SetPrincipal(c, &auth.Principal{User: &generated.User{ID: principalUserID}})
	return c, w
}

func TestHandlerList_SuccessReturnsArray(t *testing.T) {
	userID := uuid.New()
	want := []ProgramSummaryResponse{
		{ID: uuid.New(), Name: "Alpha"},
		{ID: uuid.New(), Name: "Beta"},
	}

	var gotOwnerID uuid.UUID
	svc := &fakeService{
		listByOwnerFn: func(_ context.Context, oid uuid.UUID) ([]ProgramSummaryResponse, error) {
			gotOwnerID = oid
			return want, nil
		},
	}

	c, w := newListTestContext(t, userID)
	NewHandler(svc, silentLogger()).List(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	// Auth boundary: handler must filter by the principal, not by anything
	// reachable from the request body or query string.
	if gotOwnerID != userID {
		t.Errorf("owner id passed to service: want %v (principal), got %v", userID, gotOwnerID)
	}

	var body []ProgramSummaryResponse
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if len(body) != 2 || body[0].Name != "Alpha" || body[1].Name != "Beta" {
		t.Errorf("response body: %+v", body)
	}
}

func TestHandlerList_EmptyReturnsEmptyArray(t *testing.T) {
	svc := &fakeService{
		listByOwnerFn: func(_ context.Context, _ uuid.UUID) ([]ProgramSummaryResponse, error) {
			return []ProgramSummaryResponse{}, nil
		},
	}

	c, w := newListTestContext(t, uuid.New())
	NewHandler(svc, silentLogger()).List(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", w.Code)
	}
	// Should be `[]`, not `null`. Decode into a non-nil slice and check
	// the raw body to be sure.
	if body := w.Body.String(); body != "[]" {
		t.Errorf("body: want []\\n, got %q", body)
	}
}

func TestHandlerList_ServiceErrorReturns500(t *testing.T) {
	svc := &fakeService{
		listByOwnerFn: func(_ context.Context, _ uuid.UUID) ([]ProgramSummaryResponse, error) {
			return nil, errors.New("db unreachable")
		},
	}

	c, w := newListTestContext(t, uuid.New())
	NewHandler(svc, silentLogger()).List(c)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status: want 500, got %d", w.Code)
	}
	var body ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != "internal server error" {
		t.Errorf("error message: want %q, got %q", "internal server error", body.Error)
	}
}

func TestHandlerRegisterMountsRoute(t *testing.T) {
	// Belt-and-suspenders test: confirm the path strings the handler registers
	// match the documented routes. A typo here would otherwise only be caught
	// by a hand test of the live server.
	r := gin.New()
	g := r.Group("/api")

	svc := &fakeService{
		getFullTreeFn: func(_ context.Context, _, _ uuid.UUID) (*ProgramResponse, error) {
			return &ProgramResponse{ID: uuid.New()}, nil
		},
		listByOwnerFn: func(_ context.Context, _ uuid.UUID) ([]ProgramSummaryResponse, error) {
			return []ProgramSummaryResponse{}, nil
		},
	}

	h := NewHandler(svc, silentLogger())

	// We can't reach MustPrincipal through plain router invocation without
	// also wiring the auth middleware, so add a stub middleware that sets
	// the principal — this mirrors the real production wiring.
	g.Use(func(c *gin.Context) {
		auth.SetPrincipal(c, &auth.Principal{User: &generated.User{ID: uuid.New()}})
		c.Next()
	})
	h.Register(g)

	cases := []struct {
		name string
		path string
	}{
		{"GetByID", "/api/programs/" + uuid.NewString()},
		{"List", "/api/programs"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			r.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected route to be reachable; got status %d (body=%s)", w.Code, w.Body.String())
			}
		})
	}
}
