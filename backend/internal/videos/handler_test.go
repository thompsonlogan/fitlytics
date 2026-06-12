package videos

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func init() { gin.SetMode(gin.TestMode) }

func withPrincipal(c *gin.Context, userID uuid.UUID) {
	auth.SetPrincipal(c, &auth.Principal{User: &generated.User{ID: userID}})
}

type fakeService struct {
	createFn   func(ctx context.Context, sessionID, setLogID, ownerID uuid.UUID, in CreateVideoUploadRequest) (*CreateVideoUploadResponse, error)
	finalizeFn func(ctx context.Context, videoID, ownerID uuid.UUID) (*VideoResponse, error)
	listFn     func(ctx context.Context, sessionID, ownerID uuid.UUID) ([]VideoResponse, error)
	updateFn   func(ctx context.Context, videoID, ownerID uuid.UUID, in UpdateVideoRequest) (*VideoResponse, error)
	deleteFn   func(ctx context.Context, videoID, ownerID uuid.UUID) error
}

func (f *fakeService) CreateUpload(ctx context.Context, s, l, o uuid.UUID, in CreateVideoUploadRequest) (*CreateVideoUploadResponse, error) {
	return f.createFn(ctx, s, l, o, in)
}
func (f *fakeService) Finalize(ctx context.Context, v, o uuid.UUID) (*VideoResponse, error) {
	return f.finalizeFn(ctx, v, o)
}
func (f *fakeService) ListForSession(ctx context.Context, s, o uuid.UUID) ([]VideoResponse, error) {
	return f.listFn(ctx, s, o)
}
func (f *fakeService) UpdateNote(ctx context.Context, v, o uuid.UUID, in UpdateVideoRequest) (*VideoResponse, error) {
	return f.updateFn(ctx, v, o, in)
}
func (f *fakeService) Delete(ctx context.Context, v, o uuid.UUID) error {
	return f.deleteFn(ctx, v, o)
}

func newCtx(w *httptest.ResponseRecorder, method, body string, params gin.Params) *gin.Context {
	c, _ := gin.CreateTestContext(w)
	var r *http.Request
	if body != "" {
		r = httptest.NewRequest(method, "/", bytes.NewBufferString(body))
		r.Header.Set("Content-Type", "application/json")
	} else {
		r = httptest.NewRequest(method, "/", nil)
	}
	c.Request = r
	c.Params = params
	withPrincipal(c, uuid.New())
	return c
}

// ─── disabled feature ───────────────────────────────────────────────────────

func TestHandler_DisabledReturns503(t *testing.T) {
	w := httptest.NewRecorder()
	c := newCtx(w, http.MethodGet, "", gin.Params{{Key: "sessionId", Value: uuid.NewString()}})

	NewHandler(nil, false, silentLogger()).ListForSession(c)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", w.Code)
	}
}

// ─── CreateUpload ───────────────────────────────────────────────────────────

func TestHandlerCreateUpload_InvalidSessionID(t *testing.T) {
	w := httptest.NewRecorder()
	c := newCtx(w, http.MethodPost, `{"filename":"a.mp4","content_type":"video/mp4","size_bytes":1}`, gin.Params{
		{Key: "sessionId", Value: "nope"},
		{Key: "setLogId", Value: uuid.NewString()},
	})

	NewHandler(&fakeService{}, true, silentLogger()).CreateUpload(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestHandlerCreateUpload_QuotaReturns429(t *testing.T) {
	svc := &fakeService{createFn: func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, CreateVideoUploadRequest) (*CreateVideoUploadResponse, error) {
		return nil, ErrQuotaExceeded
	}}
	w := httptest.NewRecorder()
	c := newCtx(w, http.MethodPost, `{"filename":"a.mp4","content_type":"video/mp4","size_bytes":1}`, gin.Params{
		{Key: "sessionId", Value: uuid.NewString()},
		{Key: "setLogId", Value: uuid.NewString()},
	})

	NewHandler(svc, true, silentLogger()).CreateUpload(c)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429, got %d", w.Code)
	}
}

func TestHandlerCreateUpload_InvalidInputReturns400(t *testing.T) {
	svc := &fakeService{createFn: func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, CreateVideoUploadRequest) (*CreateVideoUploadResponse, error) {
		return nil, ErrInvalidInput
	}}
	w := httptest.NewRecorder()
	c := newCtx(w, http.MethodPost, `{"filename":"a.mp4","content_type":"video/mp4","size_bytes":1}`, gin.Params{
		{Key: "sessionId", Value: uuid.NewString()},
		{Key: "setLogId", Value: uuid.NewString()},
	})

	NewHandler(svc, true, silentLogger()).CreateUpload(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestHandlerCreateUpload_Success201(t *testing.T) {
	svc := &fakeService{createFn: func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, CreateVideoUploadRequest) (*CreateVideoUploadResponse, error) {
		return &CreateVideoUploadResponse{Video: VideoResponse{ID: uuid.New(), Status: "pending"}}, nil
	}}
	w := httptest.NewRecorder()
	c := newCtx(w, http.MethodPost, `{"filename":"a.mp4","content_type":"video/mp4","size_bytes":1}`, gin.Params{
		{Key: "sessionId", Value: uuid.NewString()},
		{Key: "setLogId", Value: uuid.NewString()},
	})

	NewHandler(svc, true, silentLogger()).CreateUpload(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d", w.Code)
	}
}

// ─── Finalize / Delete ──────────────────────────────────────────────────────

func TestHandlerFinalize_NotFound404(t *testing.T) {
	svc := &fakeService{finalizeFn: func(context.Context, uuid.UUID, uuid.UUID) (*VideoResponse, error) {
		return nil, ErrNotFound
	}}
	w := httptest.NewRecorder()
	c := newCtx(w, http.MethodPost, "", gin.Params{{Key: "videoId", Value: uuid.NewString()}})

	NewHandler(svc, true, silentLogger()).Finalize(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", w.Code)
	}
}

func TestHandlerDelete_Success204(t *testing.T) {
	svc := &fakeService{deleteFn: func(context.Context, uuid.UUID, uuid.UUID) error { return nil }}
	w := httptest.NewRecorder()
	c := newCtx(w, http.MethodDelete, "", gin.Params{{Key: "videoId", Value: uuid.NewString()}})

	NewHandler(svc, true, silentLogger()).Delete(c)

	// c.Status sets the code without flushing when the handler is invoked
	// directly (the engine flushes in the normal request path), so assert the
	// status recorded on the gin writer rather than the recorder body status.
	if c.Writer.Status() != http.StatusNoContent {
		t.Fatalf("want 204, got %d", c.Writer.Status())
	}
}
