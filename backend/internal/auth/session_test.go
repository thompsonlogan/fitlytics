package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// cookieByName is a helper that finds a Set-Cookie entry by name from the
// recorder's response headers. It fails the test if the named cookie is absent.
func cookieByName(t *testing.T, rec *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()
	resp := http.Response{Header: rec.Header()}
	for _, c := range resp.Cookies() {
		if c.Name == name {
			return c
		}
	}
	t.Fatalf("cookie %q not found in response", name)
	return nil
}

func TestSetAccessCookie(t *testing.T) {
	rec := httptest.NewRecorder()
	ttl := 5 * time.Minute
	SetAccessCookie(rec, "tok_access", ttl, CookieOpts{Secure: true})

	c := cookieByName(t, rec, AccessCookie)

	if c.Path != "/" {
		t.Errorf("Path: got %q, want %q", c.Path, "/")
	}
	if !c.HttpOnly {
		t.Errorf("HttpOnly: got false, want true")
	}
	if !c.Secure {
		t.Errorf("Secure: got false, want true")
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite: got %v, want SameSiteLaxMode", c.SameSite)
	}
	if want := int(ttl.Seconds()); c.MaxAge != want {
		t.Errorf("MaxAge: got %d, want %d", c.MaxAge, want)
	}
}

func TestSetAccessCookie_InsecureDev(t *testing.T) {
	rec := httptest.NewRecorder()
	SetAccessCookie(rec, "tok_access", time.Minute, CookieOpts{Secure: false})

	c := cookieByName(t, rec, AccessCookie)
	if c.Secure {
		t.Errorf("Secure: got true, want false when CookieOpts.Secure=false")
	}
}

func TestSetRefreshCookie(t *testing.T) {
	rec := httptest.NewRecorder()
	SetRefreshCookie(rec, "tok_refresh", CookieOpts{Secure: true})

	c := cookieByName(t, rec, RefreshCookie)

	if c.Path != "/auth" {
		t.Errorf("Path: got %q, want %q", c.Path, "/auth")
	}
	if !c.HttpOnly {
		t.Errorf("HttpOnly: got false, want true")
	}
	if c.MaxAge != refreshCookieMaxAge {
		t.Errorf("MaxAge: got %d, want %d (30 days)", c.MaxAge, refreshCookieMaxAge)
	}
}

func TestNewOAuthState_NonEmpty(t *testing.T) {
	s, err := NewOAuthState()
	if err != nil {
		t.Fatalf("NewOAuthState: unexpected error: %v", err)
	}
	if s == "" {
		t.Error("NewOAuthState: returned empty string")
	}
}

func TestNewOAuthState_Distinct(t *testing.T) {
	a, err := NewOAuthState()
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	b, err := NewOAuthState()
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if a == b {
		t.Errorf("NewOAuthState returned the same value twice: %q", a)
	}
}

func TestConsumeOAuthState_HappyPath(t *testing.T) {
	state := "test_state_abc"
	req := httptest.NewRequest("GET", "/auth/callback?state="+state, nil)
	req.AddCookie(&http.Cookie{Name: OAuthStateCookie, Value: state})

	rec := httptest.NewRecorder()
	err := ConsumeOAuthState(rec, req, state, CookieOpts{})
	if err != nil {
		t.Errorf("ConsumeOAuthState: unexpected error: %v", err)
	}

	// The oauth state cookie must be cleared regardless of outcome.
	cleared := cookieByName(t, rec, OAuthStateCookie)
	if cleared.MaxAge != -1 {
		t.Errorf("cleared cookie MaxAge: got %d, want -1", cleared.MaxAge)
	}
}

func TestConsumeOAuthState_Mismatch(t *testing.T) {
	req := httptest.NewRequest("GET", "/auth/callback", nil)
	req.AddCookie(&http.Cookie{Name: OAuthStateCookie, Value: "cookie_state"})

	rec := httptest.NewRecorder()
	err := ConsumeOAuthState(rec, req, "different_state", CookieOpts{})
	if err != ErrStateMismatch {
		t.Errorf("ConsumeOAuthState mismatch: got %v, want ErrStateMismatch", err)
	}
	// Cookie must still be cleared even on mismatch.
	cookieByName(t, rec, OAuthStateCookie)
}

func TestConsumeOAuthState_MissingCookie(t *testing.T) {
	req := httptest.NewRequest("GET", "/auth/callback", nil)
	// No cookie added.
	rec := httptest.NewRecorder()
	err := ConsumeOAuthState(rec, req, "some_state", CookieOpts{})
	if err != ErrStateMismatch {
		t.Errorf("ConsumeOAuthState missing cookie: got %v, want ErrStateMismatch", err)
	}
}

func TestConsumeOAuthState_EmptyEchoed(t *testing.T) {
	req := httptest.NewRequest("GET", "/auth/callback", nil)
	req.AddCookie(&http.Cookie{Name: OAuthStateCookie, Value: "cookie_state"})

	rec := httptest.NewRecorder()
	err := ConsumeOAuthState(rec, req, "", CookieOpts{})
	if err != ErrStateMismatch {
		t.Errorf("ConsumeOAuthState empty echoed: got %v, want ErrStateMismatch", err)
	}
}

func TestClearSessionCookies(t *testing.T) {
	rec := httptest.NewRecorder()
	ClearSessionCookies(rec, CookieOpts{Secure: true})

	at := cookieByName(t, rec, AccessCookie)
	if at.Path != "/" {
		t.Errorf("access cookie Path: got %q, want %q", at.Path, "/")
	}
	if at.MaxAge != -1 {
		t.Errorf("access cookie MaxAge: got %d, want -1", at.MaxAge)
	}

	rt := cookieByName(t, rec, RefreshCookie)
	if rt.Path != "/auth" {
		t.Errorf("refresh cookie Path: got %q, want %q", rt.Path, "/auth")
	}
	if rt.MaxAge != -1 {
		t.Errorf("refresh cookie MaxAge: got %d, want -1", rt.MaxAge)
	}
}
