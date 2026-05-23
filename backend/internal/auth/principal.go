package auth

import (
	"github.com/gin-gonic/gin"

	"github.com/thompsonlogan/fitlytics/backend/internal/models"
)

// principalKey is the gin context key under which the authenticated principal
// is stored by the auth middleware.
const principalKey = "auth.principal"

// Principal is the authenticated caller for the current request: the local
// user row plus the verified token claims (role/permissions live in Claims).
type Principal struct {
	User   *models.User
	Claims *Claims
}

// SetPrincipal stores p on the request context (called by the auth middleware).
func SetPrincipal(c *gin.Context, p *Principal) {
	c.Set(principalKey, p)
}

// PrincipalFrom returns the authenticated principal, or false if the request
// did not pass through the auth middleware.
func PrincipalFrom(c *gin.Context) (*Principal, bool) {
	v, ok := c.Get(principalKey)
	if !ok {
		return nil, false
	}
	p, ok := v.(*Principal)
	return p, ok
}

// MustPrincipal returns the principal and panics if it is absent. Safe to call
// only from handlers mounted behind the auth middleware.
func MustPrincipal(c *gin.Context) *Principal {
	p, ok := PrincipalFrom(c)
	if !ok {
		panic("auth.MustPrincipal: no principal on context — handler is not behind RequireAuth")
	}
	return p
}
