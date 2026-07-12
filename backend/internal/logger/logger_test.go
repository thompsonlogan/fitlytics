package logger

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

func TestCtxHandlerAppendsRequestID(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(ctxHandler{slog.NewJSONHandler(&buf, nil)})

	log.InfoContext(WithRequestID(context.Background(), "abc123"), "hi")

	if !strings.Contains(buf.String(), `"request_id":"abc123"`) {
		t.Fatalf("expected request_id in log output, got: %s", buf.String())
	}
}

func TestCtxHandlerOmitsRequestIDWhenAbsent(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(ctxHandler{slog.NewJSONHandler(&buf, nil)})

	log.InfoContext(context.Background(), "hi")

	if strings.Contains(buf.String(), "request_id") {
		t.Fatalf("did not expect a request_id key, got: %s", buf.String())
	}
}

func TestRequestIDRoundTrip(t *testing.T) {
	if got := RequestID(context.Background()); got != "" {
		t.Fatalf("expected empty request id on a bare context, got %q", got)
	}

	ctx := WithRequestID(context.Background(), "xyz")
	if got := RequestID(ctx); got != "xyz" {
		t.Fatalf("expected xyz, got %q", got)
	}
}
