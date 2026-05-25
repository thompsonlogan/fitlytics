package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"time"
)

// Cookie names. The access cookie is path "/" so it reaches /api/*; the refresh
// and oauth-state cookies are scoped to "/auth" so they're only sent to the
// endpoints that need them — limiting exposure even within our own backend.
const (
	AccessCookie     = "fitlytics_at"
	RefreshCookie    = "fitlytics_rt"
	OAuthStateCookie = "fitlytics_oauth_state"

	refreshCookieMaxAge    = 60 * 60 * 24 * 30 // 30 days
	oauthStateCookieMaxAge = 10 * 60           // 10 minutes — login round-trip
)

// CookieOpts captures the per-environment knobs for session cookies.
// Secure must be true outside of plain-HTTP localhost development.
type CookieOpts struct {
	Secure bool
	Domain string // empty in dev; set for prod if backend is on a sub-domain
}

// SetAccessCookie writes the WorkOS access token as an HttpOnly cookie. ttl
// should match the token's lifetime (AuthKit issues 5-minute access tokens).
func SetAccessCookie(w http.ResponseWriter, token string, ttl time.Duration, o CookieOpts) {
	http.SetCookie(w, &http.Cookie{
		Name:     AccessCookie,
		Value:    token,
		Path:     "/",
		Domain:   o.Domain,
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		Secure:   o.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// SetRefreshCookie writes the WorkOS refresh token as an HttpOnly cookie scoped
// to /auth, so the browser only sends it to refresh/logout endpoints.
func SetRefreshCookie(w http.ResponseWriter, token string, o CookieOpts) {
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookie,
		Value:    token,
		Path:     "/auth",
		Domain:   o.Domain,
		MaxAge:   refreshCookieMaxAge,
		HttpOnly: true,
		Secure:   o.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ErrStateMismatch is returned when the OAuth state cookie is missing or does
// not match the state echoed back by WorkOS in the callback query string.
var ErrStateMismatch = errors.New("oauth state mismatch")

// NewOAuthState returns a cryptographically random, URL-safe value suitable
// for use as an OAuth state parameter.
func NewOAuthState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// SetOAuthStateCookie writes the freshly-minted state value to a short-lived
// HttpOnly cookie. The callback handler compares this cookie against the
// `state` query param to confirm the response belongs to a login this browser
// actually initiated.
func SetOAuthStateCookie(w http.ResponseWriter, state string, o CookieOpts) {
	http.SetCookie(w, &http.Cookie{
		Name:     OAuthStateCookie,
		Value:    state,
		Path:     "/auth",
		Domain:   o.Domain,
		MaxAge:   oauthStateCookieMaxAge,
		HttpOnly: true,
		Secure:   o.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ConsumeOAuthState validates the state echoed by WorkOS against the one we
// stored in the cookie, then expires the cookie regardless of outcome — state
// values are single-use to prevent replay.
func ConsumeOAuthState(w http.ResponseWriter, r *http.Request, echoed string, o CookieOpts) error {
	clearOAuthStateCookie(w, o)

	if echoed == "" {
		return ErrStateMismatch
	}
	c, err := r.Cookie(OAuthStateCookie)
	if err != nil || c.Value == "" {
		return ErrStateMismatch
	}
	if subtle.ConstantTimeCompare([]byte(c.Value), []byte(echoed)) != 1 {
		return ErrStateMismatch
	}
	return nil
}

func clearOAuthStateCookie(w http.ResponseWriter, o CookieOpts) {
	http.SetCookie(w, &http.Cookie{
		Name:     OAuthStateCookie,
		Value:    "",
		Path:     "/auth",
		Domain:   o.Domain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   o.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearSessionCookies expires both session cookies. Called on logout and when
// a refresh attempt fails (the refresh token is no longer trustworthy).
func ClearSessionCookies(w http.ResponseWriter, o CookieOpts) {
	for _, c := range []struct {
		name, path string
	}{
		{AccessCookie, "/"},
		{RefreshCookie, "/auth"},
	} {
		http.SetCookie(w, &http.Cookie{
			Name:     c.name,
			Value:    "",
			Path:     c.path,
			Domain:   o.Domain,
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   o.Secure,
			SameSite: http.SameSiteLaxMode,
		})
	}
}
