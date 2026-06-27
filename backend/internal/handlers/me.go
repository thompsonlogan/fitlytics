package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
)

// MeResponse is the authenticated caller's profile returned by GET /api/me.
//
// Stable, hand-curated shape (separate from the generated GORM models) so the
// OpenAPI spec and the TypeScript client stay decoupled from schema evolution.
type MeResponse struct {
	ID             uuid.UUID `json:"id"`
	WorkosUserID   string    `json:"workos_user_id"`
	DisplayName    string    `json:"display_name"`
	Email          *string   `json:"email,omitempty"`
	UnitPreference string    `json:"unit_preference" example:"imperial"`
	Timezone       string    `json:"timezone" example:"UTC"`
	Role           string    `json:"role"`
	Permissions    []string  `json:"permissions"`
} // @name MeResponse

// Me returns the authenticated caller's profile. It demonstrates reading the
// principal that RequireAuth attached — copy this pattern in feature handlers.
//
// @Summary      Get the current user
// @Description  Returns the authenticated caller's profile, including role and permissions extracted from the access token. Local fields (display name, unit preference, timezone) come from the users table; auth fields come from the token claims.
// @Tags         Auth
// @Produce      json
// @Success      200  {object}  MeResponse
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid session"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/me [get]
func Me() gin.HandlerFunc {
	return func(c *gin.Context) {
		p := auth.MustPrincipal(c)
		c.JSON(http.StatusOK, MeResponse{
			ID:             p.User.ID,
			WorkosUserID:   p.User.WorkosUserID,
			DisplayName:    p.User.DisplayName,
			Email:          p.User.Email,
			UnitPreference: p.User.UnitPreference,
			Timezone:       p.User.Timezone,
			Role:           p.Claims.Role,
			Permissions:    p.Claims.Permissions,
		})
	}
}
