package auth

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func newTestContext(t *testing.T) *gin.Context {
	t.Helper()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	return c
}

func testPrincipal() *Principal {
	return &Principal{
		User:   &generated.User{ID: uuid.New(), DisplayName: "Test User"},
		Claims: &Claims{},
	}
}

func TestPrincipalFrom_EmptyContext(t *testing.T) {
	c := newTestContext(t)
	p, ok := PrincipalFrom(c)
	if ok {
		t.Errorf("PrincipalFrom on empty context: got ok=true, want false")
	}
	if p != nil {
		t.Errorf("PrincipalFrom on empty context: got non-nil principal, want nil")
	}
}

func TestPrincipalFrom_AfterSet(t *testing.T) {
	c := newTestContext(t)
	want := testPrincipal()
	SetPrincipal(c, want)

	got, ok := PrincipalFrom(c)
	if !ok {
		t.Fatalf("PrincipalFrom after SetPrincipal: got ok=false, want true")
	}
	if got != want {
		t.Errorf("PrincipalFrom: got %p, want %p (different pointer)", got, want)
	}
}

func TestMustPrincipal_ReturnsWhenSet(t *testing.T) {
	c := newTestContext(t)
	want := testPrincipal()
	SetPrincipal(c, want)

	got := MustPrincipal(c)
	if got != want {
		t.Errorf("MustPrincipal: got %p, want %p (different pointer)", got, want)
	}
}

func TestMustPrincipal_PanicsWhenUnset(t *testing.T) {
	c := newTestContext(t)
	defer func() {
		if recover() == nil {
			t.Error("MustPrincipal on empty context: expected panic, got none")
		}
	}()
	MustPrincipal(c)
}
