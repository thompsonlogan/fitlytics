package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/thompsonlogan/fitlytics/backend/internal/logger"
)

func runWithRequestID(inbound string) (*httptest.ResponseRecorder, string) {
	r := gin.New()
	r.Use(RequestID())

	var seen string
	r.GET("/x", func(c *gin.Context) {
		seen = logger.RequestID(c.Request.Context())
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	if inbound != "" {
		req.Header.Set(RequestIDHeader, inbound)
	}
	r.ServeHTTP(w, req)
	return w, seen
}

func TestRequestIDMintsWhenAbsent(t *testing.T) {
	w, seen := runWithRequestID("")

	header := w.Header().Get(RequestIDHeader)
	if header == "" {
		t.Fatal("expected a minted X-Request-ID response header")
	}
	if seen != header {
		t.Fatalf("context id %q should match the response header %q", seen, header)
	}
}

func TestRequestIDReusesInboundHeader(t *testing.T) {
	w, seen := runWithRequestID("edge-123")

	if got := w.Header().Get(RequestIDHeader); got != "edge-123" {
		t.Fatalf("expected response header edge-123, got %q", got)
	}
	if seen != "edge-123" {
		t.Fatalf("expected context id edge-123, got %q", seen)
	}
}

func TestRequestIDReplacesOversizeHeader(t *testing.T) {
	big := strings.Repeat("a", maxRequestIDLen+1)
	w, seen := runWithRequestID(big)

	got := w.Header().Get(RequestIDHeader)
	if got == "" || got == big {
		t.Fatalf("expected a fresh id replacing the oversize header, got %q", got)
	}
	if seen != got {
		t.Fatalf("context id %q should match the response header %q", seen, got)
	}
}
