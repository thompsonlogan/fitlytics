// Package middleware holds the Gin middleware for the API: request logging and
// WorkOS authentication.
package middleware

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

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
		raw, ok := bearerToken(c)
		if !ok {
			abortUnauthorized(c, "missing bearer token")
			return
		}

		claims, err := verifier.Verify(raw)
		if err != nil {
			abortUnauthorized(c, "invalid token")
			return
		}

		user, err := userSvc.ResolveOrProvision(c.Request.Context(), claims)
		if err != nil {
			// The token is valid but we could not establish a local user —
			// a server-side problem (DB or WorkOS API), not a client one.
			log.ErrorContext(c.Request.Context(), "resolve principal failed",
				slog.String("workos_user_id", claims.Subject),
				slog.String("error", err.Error()))
			c.AbortWithStatusJSON(http.StatusInternalServerError,
				gin.H{"error": "could not establish session"})
			return
		}

		auth.SetPrincipal(c, &auth.Principal{User: user, Claims: claims})
		c.Next()
	}
}

// bearerToken extracts the token from an "Authorization: Bearer <token>" header.
func bearerToken(c *gin.Context) (string, bool) {
	header := c.GetHeader("Authorization")
	if header == "" {
		return "", false
	}
	const prefix = "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", false
	}
	token := strings.TrimSpace(header[len(prefix):])
	return token, token != ""
}

func abortUnauthorized(c *gin.Context, reason string) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": reason})
}
