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

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/middleware"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// ─── GetProgramById ───────────────────────────────────────────────────────────────────

func newTestContext(t *testing.T, principalUserID uuid.UUID, idParam string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/programs/"+idParam, nil)
	c.Params = gin.Params{gin.Param{Key: "id", Value: idParam}}

	auth.SetPrincipal(c, &auth.Principal{
		User: &generated.User{ID: principalUserID},
	})
	middleware.SetResourceOwner(c, principalUserID)
	return c, w
}

func newTestHandler(svc Service) *Handler {
	guard := func(c *gin.Context) {
		middleware.SetResourceOwner(c, auth.MustPrincipal(c).User.ID)
		c.Next()
	}
	return NewHandler(svc, guard, silentLogger())
}

func TestHandler_GetProgramById_InvalidUUIDReturns400(t *testing.T) {
	h := newTestHandler(&fakeService{})
	c, w := newTestContext(t, uuid.New(), "not-a-uuid")

	h.GetProgramById(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", w.Code)
	}
	var body apierr.ProblemDetails
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Detail == "" {
		t.Error("expected non-empty detail message")
	}
	if body.Status != http.StatusBadRequest {
		t.Errorf("status in body: want %d, got %d", http.StatusBadRequest, body.Status)
	}
}

func TestHandler_GetProgramById_ServiceNotFoundReturns404(t *testing.T) {
	svc := &fakeService{
		getProgramByIdFn: func(_ context.Context, _, _ uuid.UUID) (*ProgramResponse, error) {
			return nil, apierr.ErrNotFound
		},
	}
	c, w := newTestContext(t, uuid.New(), uuid.NewString())

	newTestHandler(svc).GetProgramById(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status: want 404, got %d", w.Code)
	}
	var body apierr.ProblemDetails
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Detail != "program not found" {
		t.Errorf("detail: want %q, got %q", "program not found", body.Detail)
	}
	if body.Status != http.StatusNotFound {
		t.Errorf("status in body: want %d, got %d", http.StatusNotFound, body.Status)
	}
}

func TestHandler_GetProgramById_GenericServiceErrorReturns500(t *testing.T) {
	svc := &fakeService{
		getProgramByIdFn: func(_ context.Context, _, _ uuid.UUID) (*ProgramResponse, error) {
			return nil, errors.New("kaboom")
		},
	}
	c, w := newTestContext(t, uuid.New(), uuid.NewString())

	newTestHandler(svc).GetProgramById(c)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status: want 500, got %d", w.Code)
	}
	var body apierr.ProblemDetails
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Detail != "internal server error" {
		t.Errorf("detail: want %q, got %q", "internal server error", body.Detail)
	}
	if body.Status != http.StatusInternalServerError {
		t.Errorf("status in body: want %d, got %d", http.StatusInternalServerError, body.Status)
	}
}

func TestHandler_GetProgramById_SuccessReturns200WithJSON(t *testing.T) {
	userID := uuid.New()
	programID := uuid.New()

	want := &ProgramResponse{
		ID:    programID,
		Name:  "Sample",
		Weeks: []ProgramWeekResponse{},
	}

	var gotProgramID, gotOwnerID uuid.UUID
	svc := &fakeService{
		getProgramByIdFn: func(_ context.Context, pid, oid uuid.UUID) (*ProgramResponse, error) {
			gotProgramID, gotOwnerID = pid, oid
			return want, nil
		},
	}

	c, w := newTestContext(t, userID, programID.String())
	newTestHandler(svc).GetProgramById(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	if gotProgramID != programID {
		t.Errorf("program id passed to service: want %v, got %v", programID, gotProgramID)
	}

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

// ─── GetProgramsByUserId ───────────────────────────────────────────────────────────────────

func newListTestContext(t *testing.T, principalUserID uuid.UUID) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/programs", nil)
	auth.SetPrincipal(c, &auth.Principal{User: &generated.User{ID: principalUserID}})
	return c, w
}

func TestHandler_GetProgramsByUserId_SuccessReturnsArray(t *testing.T) {
	userID := uuid.New()
	want := []ProgramSummaryResponse{
		{ID: uuid.New(), Name: "Alpha"},
		{ID: uuid.New(), Name: "Beta"},
	}

	var gotOwnerID uuid.UUID
	svc := &fakeService{
		getProgramsByUserIdFn: func(_ context.Context, oid uuid.UUID) ([]ProgramSummaryResponse, error) {
			gotOwnerID = oid
			return want, nil
		},
	}

	c, w := newListTestContext(t, userID)
	newTestHandler(svc).GetProgramsByUserId(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
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

func TestHandler_GetProgramsByUserId_EmptyReturnsEmptyArray(t *testing.T) {
	svc := &fakeService{
		getProgramsByUserIdFn: func(_ context.Context, _ uuid.UUID) ([]ProgramSummaryResponse, error) {
			return []ProgramSummaryResponse{}, nil
		},
	}

	c, w := newListTestContext(t, uuid.New())
	newTestHandler(svc).GetProgramsByUserId(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", w.Code)
	}
	if body := w.Body.String(); body != "[]" {
		t.Errorf("body: want []\\n, got %q", body)
	}
}

func TestHandler_GetProgramsByUserId_ServiceErrorReturns500(t *testing.T) {
	svc := &fakeService{
		getProgramsByUserIdFn: func(_ context.Context, _ uuid.UUID) ([]ProgramSummaryResponse, error) {
			return nil, errors.New("db unreachable")
		},
	}

	c, w := newListTestContext(t, uuid.New())
	newTestHandler(svc).GetProgramsByUserId(c)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status: want 500, got %d", w.Code)
	}
	var body apierr.ProblemDetails
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Detail != "internal server error" {
		t.Errorf("detail: want %q, got %q", "internal server error", body.Detail)
	}
}

func TestHandlerRegisterMountsRoute(t *testing.T) {
	r := gin.New()
	g := r.Group("/api")

	svc := &fakeService{
		getProgramByIdFn: func(_ context.Context, _, _ uuid.UUID) (*ProgramResponse, error) {
			return &ProgramResponse{ID: uuid.New()}, nil
		},
		getProgramsByUserIdFn: func(_ context.Context, _ uuid.UUID) ([]ProgramSummaryResponse, error) {
			return []ProgramSummaryResponse{}, nil
		},
	}

	h := newTestHandler(svc)

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
