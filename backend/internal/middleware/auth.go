// Package middleware holds the Gin middleware for the API: request logging and
// WorkOS authentication.
package middleware

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/users"
)

// RequireAuth verifies the WorkOS access token on the request, resolves it to a
// local user (provisioning one on first sight), and attaches an *auth.Principal
// to the context. Requests without a valid token are rejected with 401.
//
// Pipeline position: mount this on the protected route group, after the
// request logger and gin.Recovery.
func RequireAuth(verifier *auth.Verifier, userSvc *users.Service, log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := extractToken(c)
		if !ok {
			apierr.Unauthorized(c, "missing access token")
			return
		}

		claims, err := verifier.Verify(raw)
		if err != nil {
			apierr.Unauthorized(c, "invalid token")
			return
		}

		user, err := userSvc.ResolveOrProvision(c.Request.Context(), claims)
		if err != nil {
			// The token is valid but we could not establish a local user —
			// a server-side problem (DB or WorkOS API), not a client one.
			log.ErrorContext(c.Request.Context(), "resolve principal failed",
				slog.String("workos_user_id", claims.Subject),
				slog.String("error", err.Error()))
			apierr.Abort(c, http.StatusInternalServerError, "could not establish session")
			return
		}

		auth.SetPrincipal(c, &auth.Principal{User: user, Claims: claims})
		c.Next()
	}
}

// DevAuthBypass skips JWT verification and authenticates every request as the
// given user. Development only — never enable in production.
func DevAuthBypass(userSvc *users.Service, userID uuid.UUID, log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := userSvc.FindByID(c.Request.Context(), userID)
		if err != nil {
			log.ErrorContext(c.Request.Context(), "dev auth bypass: user not found",
				slog.String("user_id", userID.String()),
				slog.String("error", err.Error()))
			apierr.Abort(c, http.StatusInternalServerError, "dev auth bypass: user not found")
			return
		}

		claims := &auth.Claims{}
		claims.Subject = user.WorkosUserID

		auth.SetPrincipal(c, &auth.Principal{User: user, Claims: claims})
		c.Next()
	}
}

// extractToken returns the access token from either an
// "Authorization: Bearer <token>" header or the session cookie set by the
// /auth/callback handler. The header wins when both are present so tools like
// curl and Swagger continue to work alongside browser sessions.
func extractToken(c *gin.Context) (string, bool) {
	if header := c.GetHeader("Authorization"); header != "" {
		const prefix = "Bearer "
		if len(header) > len(prefix) && strings.EqualFold(header[:len(prefix)], prefix) {
			if tok := strings.TrimSpace(header[len(prefix):]); tok != "" {
				return tok, true
			}
		}
	}
	if cookie, err := c.Cookie(auth.AccessCookie); err == nil && cookie != "" {
		return cookie, true
	}
	return "", false
}
