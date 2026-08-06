package handlers

import (
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/workos/workos-go/v4/pkg/usermanagement"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
)

// accessCookieTTL matches the lifetime of WorkOS-issued access tokens. The
// cookie expires alongside the token so a stale cookie isn't sitting around.
const accessCookieTTL = 5 * time.Minute

// AuthDeps is the static configuration the auth handlers need. Built once in
// main.go and passed into the router.
type AuthDeps struct {
	ClientID    string
	RedirectURI string // absolute URL of /auth/callback registered in WorkOS
	AppURL      string // absolute URL of the SPA root, used for redirects
	Cookies     auth.CookieOpts
	Verifier    *auth.Verifier // used by AuthLogout to extract sid for RevokeSession
	Log         *slog.Logger
}

// AuthLogin starts the hosted AuthKit flow by redirecting the browser to the
// WorkOS authorization URL. The user authenticates on AuthKit, then WorkOS
// redirects back to RedirectURI with a `code` query param.
//
// A cryptographically random `state` value is generated, stored in a
// short-lived HttpOnly cookie, and echoed in the authorize URL. AuthCallback
// requires the two to match — that's what prevents a third party from forging
// a callback request that completes sign-in as their account.
//
// @Summary      Start sign-in
// @Description  Generates an OAuth state cookie and redirects the browser to WorkOS AuthKit.
// @Tags         Auth
// @Success      302  "redirect to WorkOS AuthKit"
// @Failure      500  {object}  apierr.ProblemDetails  "could not start sign-in"
// @Router       /auth/login [get]
func AuthLogin(d AuthDeps) gin.HandlerFunc {
	return func(c *gin.Context) {
		state, err := auth.NewOAuthState()
		if err != nil {
			d.Log.ErrorContext(c.Request.Context(), "generate oauth state failed",
				slog.String("error", err.Error()))
			apierr.Abort(c, http.StatusInternalServerError, "could not start sign-in")
			return
		}
		auth.SetOAuthStateCookie(c.Writer, state, d.Cookies)

		authURL, err := usermanagement.GetAuthorizationURL(usermanagement.GetAuthorizationURLOpts{
			ClientID:    d.ClientID,
			RedirectURI: d.RedirectURI,
			Provider:    "authkit",
			State:       state,
		})
		if err != nil {
			d.Log.ErrorContext(c.Request.Context(), "build authorization URL failed",
				slog.String("error", err.Error()))
			apierr.Abort(c, http.StatusInternalServerError, "could not start sign-in")
			return
		}
		c.Redirect(http.StatusFound, authURL.String())
	}
}

// AuthCallback exchanges the authorization code for an access + refresh token
// pair, stores both as HttpOnly cookies, and bounces the browser back to the
// SPA. On failure the user is redirected to the SPA with an `auth_error`
// query param so the frontend can surface the cause.
//
// @Summary      Complete sign-in
// @Description  Handles the WorkOS AuthKit callback, validates OAuth state, exchanges the authorization code, stores session cookies, and redirects back to the SPA. Auth failures also redirect to the SPA with an auth_error query parameter.
// @Tags         Auth
// @Param        code   query  string  false  "WorkOS authorization code"
// @Param        state  query  string  false  "OAuth state echoed from /auth/login"
// @Success      302    "redirect to the SPA"
// @Router       /auth/callback [get]
func AuthCallback(d AuthDeps) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Validate state first. The cookie is consumed regardless of outcome
		// (single-use), so a replayed callback can't succeed even if it has a
		// stolen `code`.
		if err := auth.ConsumeOAuthState(c.Writer, c.Request, c.Query("state"), d.Cookies); err != nil {
			d.Log.WarnContext(c.Request.Context(), "oauth state mismatch",
				slog.String("error", err.Error()))
			c.Redirect(http.StatusFound, appURLWithError(d.AppURL, "invalid_state"))
			return
		}

		code := c.Query("code")
		if code == "" {
			c.Redirect(http.StatusFound, appURLWithError(d.AppURL, "missing_code"))
			return
		}

		resp, err := usermanagement.AuthenticateWithCode(c.Request.Context(),
			usermanagement.AuthenticateWithCodeOpts{
				ClientID: d.ClientID,
				Code:     code,
			})
		if err != nil {
			d.Log.WarnContext(c.Request.Context(), "code exchange failed",
				slog.String("error", err.Error()))
			c.Redirect(http.StatusFound, appURLWithError(d.AppURL, "exchange_failed"))
			return
		}

		auth.SetAccessCookie(c.Writer, resp.AccessToken, accessCookieTTL, d.Cookies)
		if resp.RefreshToken != "" {
			auth.SetRefreshCookie(c.Writer, resp.RefreshToken, d.Cookies)
		}
		c.Redirect(http.StatusFound, d.AppURL+"/today")
	}
}

// AuthRefresh swaps the refresh-token cookie for a fresh access token. The SPA
// calls this when /api/me returns 401, so token expiry is invisible to the user.
// Refresh failures clear both cookies — the session is dead and the user must
// sign in again.
//
// @Summary      Refresh the session
// @Description  Swaps the refresh-token cookie for a fresh access-token cookie. Returns 204 on success and 401 when the refresh token is missing, expired, or rejected by WorkOS — in which case both session cookies are cleared and the SPA should redirect to /auth/login.
// @Tags         Auth
// @Success      204  "session refreshed"
// @Failure      401  "no refresh token or refresh rejected"
// @Router       /auth/refresh [post]
func AuthRefresh(d AuthDeps) gin.HandlerFunc {
	return func(c *gin.Context) {
		rt, err := c.Cookie(auth.RefreshCookie)
		if err != nil || rt == "" {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}

		resp, err := usermanagement.AuthenticateWithRefreshToken(c.Request.Context(),
			usermanagement.AuthenticateWithRefreshTokenOpts{
				ClientID:     d.ClientID,
				RefreshToken: rt,
			})
		if err != nil {
			d.Log.InfoContext(c.Request.Context(), "refresh failed; clearing session",
				slog.String("error", err.Error()))
			auth.ClearSessionCookies(c.Writer, d.Cookies)
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}

		auth.SetAccessCookie(c.Writer, resp.AccessToken, accessCookieTTL, d.Cookies)
		if resp.RefreshToken != "" {
			auth.SetRefreshCookie(c.Writer, resp.RefreshToken, d.Cookies)
		}
		c.Status(http.StatusNoContent)
	}
}

// AuthLogout revokes the WorkOS session (best-effort) and clears the local
// session cookies. Revocation is best-effort because the access token may have
// already expired by the time the user clicks logout — in that case the
// WorkOS session times out on its own. Cookies are always cleared so the SPA
// reflects logout immediately regardless.
//
// @Summary      Sign out
// @Description  Clears the local session cookies and revokes the WorkOS session (best-effort). Always returns 204 — a missing or expired cookie is not an error; logout is idempotent.
// @Tags         Auth
// @Success      204  "logged out"
// @Router       /auth/logout [post]
func AuthLogout(d AuthDeps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if sid := extractSessionID(c, d.Verifier); sid != "" {
			if err := usermanagement.RevokeSession(c.Request.Context(),
				usermanagement.RevokeSessionOpts{SessionID: sid}); err != nil {
				d.Log.WarnContext(c.Request.Context(), "revoke workos session failed",
					slog.String("session_id", sid),
					slog.String("error", err.Error()))
			}
		}
		auth.ClearSessionCookies(c.Writer, d.Cookies)
		c.Status(http.StatusNoContent)
	}
}

// extractSessionID pulls the `sid` claim from the access cookie. Returns "" if
// the cookie is absent, expired, or otherwise unverifiable — the caller treats
// that as "nothing to revoke."
func extractSessionID(c *gin.Context, v *auth.Verifier) string {
	if v == nil {
		return ""
	}
	raw, err := c.Cookie(auth.AccessCookie)
	if err != nil || raw == "" {
		return ""
	}
	claims, err := v.Verify(raw)
	if err != nil {
		return ""
	}
	return claims.SessionID
}

// appURLWithError appends an auth_error query param without parsing/rebuilding
// the SPA URL — keeps the redirect cheap for the happy path.
func appURLWithError(appURL, reason string) string {
	u, err := url.Parse(appURL)
	if err != nil {
		return appURL
	}
	q := u.Query()
	q.Set("auth_error", reason)
	u.RawQuery = q.Encode()
	return u.String()
}
