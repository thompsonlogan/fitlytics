package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
)

// Me returns the authenticated caller's profile. It demonstrates reading the
// principal that RequireAuth attached — copy this pattern in feature handlers.
func Me() gin.HandlerFunc {
	return func(c *gin.Context) {
		p := auth.MustPrincipal(c)
		c.JSON(http.StatusOK, gin.H{
			"id":             p.User.ID,
			"workos_user_id": p.User.WorkosUserID,
			"display_name":   p.User.DisplayName,
			"email":          p.User.Email,
			"unit_pref":      p.User.UnitPref,
			"timezone":       p.User.Timezone,
			"role":           p.Claims.Role,
			"permissions":    p.Claims.Permissions,
		})
	}
}
