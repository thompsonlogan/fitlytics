package sessions

import (
	"bytes"
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
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func withPrincipal(c *gin.Context, userID uuid.UUID) {
	auth.SetPrincipal(c, &auth.Principal{User: &generated.User{ID: userID}})
}

// ─── GetCurrentSession ──────────────────────────────────────────────────────

func TestHandlerGetCurrentSession_InvalidProgramID(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/programs/x/days/y/sessions/current", nil)
	c.Params = gin.Params{
		{Key: "id", Value: "not-a-uuid"},
		{Key: "dayId", Value: uuid.NewString()},
	}
	withPrincipal(c, uuid.New())

	NewHandler(&fakeService{}, silentLogger()).GetCurrentSession(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", w.Code)
	}
}

func TestHandlerGetCurrentSession_NotFoundReturns404(t *testing.T) {
	svc := &fakeService{
		findCurrentFn: func(_ context.Context, _, _ uuid.UUID) (*SessionResponse, error) {
			return nil, apierr.ErrNotFound
		},
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/programs/p/days/d/sessions/current", nil)
	c.Params = gin.Params{
		{Key: "id", Value: uuid.NewString()},
		{Key: "dayId", Value: uuid.NewString()},
	}
	withPrincipal(c, uuid.New())

	NewHandler(svc, silentLogger()).GetCurrentSession(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status: want 404, got %d", w.Code)
	}
}

func TestHandlerGetCurrentSession_SuccessReturnsBody(t *testing.T) {
	userID := uuid.New()
	dayID := uuid.New()
	sessionID := uuid.New()

	var gotDayID, gotOwnerID uuid.UUID
	svc := &fakeService{
		findCurrentFn: func(_ context.Context, did, oid uuid.UUID) (*SessionResponse, error) {
			gotDayID, gotOwnerID = did, oid
			return &SessionResponse{ID: sessionID, State: "in_progress"}, nil
		},
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Params = gin.Params{
		{Key: "id", Value: uuid.NewString()},
		{Key: "dayId", Value: dayID.String()},
	}
	withPrincipal(c, userID)

	NewHandler(svc, silentLogger()).GetCurrentSession(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	// Auth boundary — service receives principal id, not anything from the body.
	if gotDayID != dayID || gotOwnerID != userID {
		t.Errorf("ids passed to service: day=%v owner=%v (want day=%v owner=%v)", gotDayID, gotOwnerID, dayID, userID)
	}
}

// ─── StartSession ───────────────────────────────────────────────────────────

func TestHandlerStartSession_NotFoundFor404(t *testing.T) {
	svc := &fakeService{
		ensureForDayFn: func(_ context.Context, _, _, _ uuid.UUID) (*SessionResponse, error) {
			return nil, apierr.ErrNotFound
		},
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	c.Params = gin.Params{
		{Key: "id", Value: uuid.NewString()},
		{Key: "dayId", Value: uuid.NewString()},
	}
	withPrincipal(c, uuid.New())

	NewHandler(svc, silentLogger()).StartSession(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status: want 404, got %d", w.Code)
	}
}

func TestHandlerStartSession_SuccessReturnsSession(t *testing.T) {
	userID := uuid.New()
	programID := uuid.New()
	dayID := uuid.New()
	sessionID := uuid.New()

	var gotProgramID, gotDayID, gotOwnerID uuid.UUID
	svc := &fakeService{
		ensureForDayFn: func(_ context.Context, pid, did, oid uuid.UUID) (*SessionResponse, error) {
			gotProgramID, gotDayID, gotOwnerID = pid, did, oid
			return &SessionResponse{ID: sessionID, State: "in_progress"}, nil
		},
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	c.Params = gin.Params{
		{Key: "id", Value: programID.String()},
		{Key: "dayId", Value: dayID.String()},
	}
	withPrincipal(c, userID)

	NewHandler(svc, silentLogger()).StartSession(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	if gotProgramID != programID || gotDayID != dayID || gotOwnerID != userID {
		t.Errorf("ids passed to service: prog=%v day=%v owner=%v", gotProgramID, gotDayID, gotOwnerID)
	}

	var resp SessionResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ID != sessionID {
		t.Errorf("response id: want %v, got %v", sessionID, resp.ID)
	}
}

// ─── UpdateSetLog ───────────────────────────────────────────────────────────

func newPatchSetLogContext(t *testing.T, userID uuid.UUID, sessionID, setLogID string, body any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPatch, "/", bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{
		{Key: "sessionId", Value: sessionID},
		{Key: "setLogId", Value: setLogID},
	}
	withPrincipal(c, userID)
	return c, w
}

func TestHandlerUpdateSetLog_InvalidIDsReturn400(t *testing.T) {
	c, w := newPatchSetLogContext(t, uuid.New(), "not-a-uuid", uuid.NewString(),
		UpdateSetLogRequest{ActualRpe: ptr(7.0)})
	NewHandler(&fakeService{}, silentLogger()).UpdateSetLog(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", w.Code)
	}
}

func TestHandlerUpdateSetLog_InvalidInputReturns400(t *testing.T) {
	svc := &fakeService{
		updateSetLogFn: func(_ context.Context, _, _, _ uuid.UUID, _ UpdateSetLogRequest) (*SetLogResponse, error) {
			return nil, errors.Join(apierr.ErrInvalidInput, errors.New("actual_rpe out of range"))
		},
	}
	c, w := newPatchSetLogContext(t, uuid.New(), uuid.NewString(), uuid.NewString(),
		UpdateSetLogRequest{ActualRpe: ptr(42.0)})
	NewHandler(svc, silentLogger()).UpdateSetLog(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", w.Code)
	}
}

func TestHandlerUpdateSetLog_NotFoundReturns404(t *testing.T) {
	svc := &fakeService{
		updateSetLogFn: func(_ context.Context, _, _, _ uuid.UUID, _ UpdateSetLogRequest) (*SetLogResponse, error) {
			return nil, apierr.ErrNotFound
		},
	}
	c, w := newPatchSetLogContext(t, uuid.New(), uuid.NewString(), uuid.NewString(),
		UpdateSetLogRequest{ActualRpe: ptr(7.0)})
	NewHandler(svc, silentLogger()).UpdateSetLog(c)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status: want 404, got %d", w.Code)
	}
}

func TestHandlerUpdateSetLog_GenericErrorReturns500(t *testing.T) {
	svc := &fakeService{
		updateSetLogFn: func(_ context.Context, _, _, _ uuid.UUID, _ UpdateSetLogRequest) (*SetLogResponse, error) {
			return nil, errors.New("kaboom")
		},
	}
	c, w := newPatchSetLogContext(t, uuid.New(), uuid.NewString(), uuid.NewString(),
		UpdateSetLogRequest{ActualRpe: ptr(7.0)})
	NewHandler(svc, silentLogger()).UpdateSetLog(c)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status: want 500, got %d (body=%s)", w.Code, w.Body.String())
	}
}

func TestHandlerUpdateSetLog_SuccessReturnsBody(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	setLogID := uuid.New()

	want := &SetLogResponse{
		ID:                 setLogID,
		Sequence:           1,
		SetType:            "working",
		ActualLoadKg:       ptr(130.0),
		ActualLoadModifier: "absolute",
		ActualRpe:          ptr(8.5),
		State:              "completed",
	}
	var (
		gotSessionID, gotSetLogID, gotOwnerID uuid.UUID
		gotInput                              UpdateSetLogRequest
	)
	svc := &fakeService{
		updateSetLogFn: func(_ context.Context, sid, slid, oid uuid.UUID, in UpdateSetLogRequest) (*SetLogResponse, error) {
			gotSessionID, gotSetLogID, gotOwnerID = sid, slid, oid
			gotInput = in
			return want, nil
		},
	}
	c, w := newPatchSetLogContext(t, userID, sessionID.String(), setLogID.String(),
		UpdateSetLogRequest{ActualLoadKg: ptr(130.0), ActualRpe: ptr(8.5), State: ptr("completed")})
	NewHandler(svc, silentLogger()).UpdateSetLog(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", w.Code)
	}
	if gotSessionID != sessionID || gotSetLogID != setLogID || gotOwnerID != userID {
		t.Errorf("ids: session=%v setLog=%v owner=%v", gotSessionID, gotSetLogID, gotOwnerID)
	}
	if gotInput.State == nil || *gotInput.State != "completed" {
		t.Errorf("state not threaded through: %+v", gotInput)
	}
}

// ─── GetCompletedDays ──────────────────────────────────────────────────────

func TestHandlerGetCompletedDays_InvalidProgramIDReturns400(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/programs/x/day-completions", nil)
	c.Params = gin.Params{{Key: "id", Value: "not-a-uuid"}}
	withPrincipal(c, uuid.New())

	NewHandler(&fakeService{}, silentLogger()).GetCompletedDays(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", w.Code)
	}
}

func TestHandlerGetCompletedDays_SuccessReturnsRows(t *testing.T) {
	userID := uuid.New()
	programID := uuid.New()
	want := []CompletedDayResponse{
		{WeekSequence: 1, DaySequence: 1},
		{WeekSequence: 2, DaySequence: 3},
	}
	var gotProgramID, gotOwnerID uuid.UUID
	svc := &fakeService{
		listCompletedDaysFn: func(_ context.Context, pid, oid uuid.UUID) ([]CompletedDayResponse, error) {
			gotProgramID, gotOwnerID = pid, oid
			return want, nil
		},
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Params = gin.Params{{Key: "id", Value: programID.String()}}
	withPrincipal(c, userID)

	NewHandler(svc, silentLogger()).GetCompletedDays(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	if gotProgramID != programID || gotOwnerID != userID {
		t.Errorf("ids: program=%v owner=%v", gotProgramID, gotOwnerID)
	}
	var resp []CompletedDayResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp) != 2 || resp[0].WeekSequence != 1 || resp[1].DaySequence != 3 {
		t.Errorf("body mismatch: %+v", resp)
	}
}

// ─── UpdateSession ─────────────────────────────────────────────────────────

func newPatchSessionContext(t *testing.T, userID uuid.UUID, sessionID string, body any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPatch, "/", bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "sessionId", Value: sessionID}}
	withPrincipal(c, userID)
	return c, w
}

func TestHandlerUpdateSession_InvalidIDReturns400(t *testing.T) {
	c, w := newPatchSessionContext(t, uuid.New(), "not-a-uuid", UpdateSessionRequest{Notes: ptr("hi")})
	NewHandler(&fakeService{}, silentLogger()).UpdateSession(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", w.Code)
	}
}

func TestHandlerUpdateSession_NotFoundReturns404(t *testing.T) {
	svc := &fakeService{
		updateSessionFn: func(_ context.Context, _, _ uuid.UUID, _ UpdateSessionRequest) (*SessionResponse, error) {
			return nil, apierr.ErrNotFound
		},
	}
	c, w := newPatchSessionContext(t, uuid.New(), uuid.NewString(), UpdateSessionRequest{Notes: ptr("hi")})
	NewHandler(svc, silentLogger()).UpdateSession(c)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status: want 404, got %d", w.Code)
	}
}

func TestHandlerUpdateSession_GenericErrorReturns500(t *testing.T) {
	svc := &fakeService{
		updateSessionFn: func(_ context.Context, _, _ uuid.UUID, _ UpdateSessionRequest) (*SessionResponse, error) {
			return nil, errors.New("kaboom")
		},
	}
	c, w := newPatchSessionContext(t, uuid.New(), uuid.NewString(), UpdateSessionRequest{Notes: ptr("hi")})
	NewHandler(svc, silentLogger()).UpdateSession(c)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status: want 500, got %d (body=%s)", w.Code, w.Body.String())
	}
}

func TestHandlerUpdateSession_SuccessThreadsNotesAndReturnsBody(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	want := &SessionResponse{ID: sessionID, State: "in_progress", Notes: ptr("bar speed good")}

	var (
		gotSessionID, gotOwnerID uuid.UUID
		gotInput                 UpdateSessionRequest
	)
	svc := &fakeService{
		updateSessionFn: func(_ context.Context, sid, oid uuid.UUID, in UpdateSessionRequest) (*SessionResponse, error) {
			gotSessionID, gotOwnerID = sid, oid
			gotInput = in
			return want, nil
		},
	}
	c, w := newPatchSessionContext(t, userID, sessionID.String(), UpdateSessionRequest{Notes: ptr("bar speed good")})
	NewHandler(svc, silentLogger()).UpdateSession(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	if gotSessionID != sessionID || gotOwnerID != userID {
		t.Errorf("ids: session=%v owner=%v", gotSessionID, gotOwnerID)
	}
	if gotInput.Notes == nil || *gotInput.Notes != "bar speed good" {
		t.Errorf("notes not threaded through: %+v", gotInput)
	}
	var resp SessionResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Notes == nil || *resp.Notes != "bar speed good" {
		t.Errorf("response notes mismatch: %+v", resp.Notes)
	}
}

// ─── Register ───────────────────────────────────────────────────────────────

func TestHandlerRegister_MountsAllRoutes(t *testing.T) {
	r := gin.New()
	g := r.Group("/api")

	svc := &fakeService{
		findCurrentFn: func(_ context.Context, _, _ uuid.UUID) (*SessionResponse, error) {
			return &SessionResponse{ID: uuid.New()}, nil
		},
		ensureForDayFn: func(_ context.Context, _, _, _ uuid.UUID) (*SessionResponse, error) {
			return &SessionResponse{ID: uuid.New()}, nil
		},
		updateSetLogFn: func(_ context.Context, _, slid, _ uuid.UUID, _ UpdateSetLogRequest) (*SetLogResponse, error) {
			return &SetLogResponse{ID: slid}, nil
		},
		listCompletedDaysFn: func(_ context.Context, _, _ uuid.UUID) ([]CompletedDayResponse, error) {
			return []CompletedDayResponse{}, nil
		},
		updateSessionFn: func(_ context.Context, sid, _ uuid.UUID, _ UpdateSessionRequest) (*SessionResponse, error) {
			return &SessionResponse{ID: sid}, nil
		},
	}

	g.Use(func(c *gin.Context) {
		auth.SetPrincipal(c, &auth.Principal{User: &generated.User{ID: uuid.New()}})
		c.Next()
	})
	NewHandler(svc, silentLogger()).Register(g)

	cases := []struct {
		name   string
		method string
		path   string
		body   io.Reader
	}{
		{"GetCurrent", http.MethodGet,
			"/api/programs/" + uuid.NewString() + "/days/" + uuid.NewString() + "/sessions/current", nil},
		{"Start", http.MethodPost,
			"/api/programs/" + uuid.NewString() + "/days/" + uuid.NewString() + "/sessions", nil},
		{"UpdateSetLog", http.MethodPatch,
			"/api/sessions/" + uuid.NewString() + "/set-logs/" + uuid.NewString(),
			bytes.NewBufferString(`{"actual_rpe": 7.5}`)},
		{"GetCompletedDays", http.MethodGet,
			"/api/programs/" + uuid.NewString() + "/day-completions", nil},
		{"UpdateSession", http.MethodPatch,
			"/api/sessions/" + uuid.NewString(),
			bytes.NewBufferString(`{"notes": "felt good"}`)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest(tc.method, tc.path, tc.body)
			if tc.body != nil {
				req.Header.Set("Content-Type", "application/json")
			}
			r.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Fatalf("route not reachable; status %d (body=%s)", w.Code, w.Body.String())
			}
		})
	}
}
