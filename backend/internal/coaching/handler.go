package coaching

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
)

type Handler struct {
	service Service
	log     *slog.Logger
}

func NewHandler(service Service, log *slog.Logger) *Handler {
	return &Handler{service: service, log: log}
}

func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.GET("/athletes", h.GetRoster)
}

// GetRoster returns the caller's coached athletes with their training summary.
//
// @Summary      List coached athletes
// @Description  Returns every athlete linked to the authenticated coach, with their current program position and a training summary over the trailing 28 days. Compliance is the share of sessions the program called for that the athlete completed, and is omitted entirely when nothing was due — which is different from 0%.
// @Tags         Coach
// @Produce      json
// @Success      200  {array}   CoachAthleteSummaryResponse
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      403  {object}  apierr.ProblemDetails  "forbidden"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/coach/athletes [get]
func (h *Handler) GetRoster(c *gin.Context) {
	principal := auth.MustPrincipal(c)

	roster, err := h.service.GetRoster(c.Request.Context(), principal.User.ID)
	if err != nil {
		h.log.ErrorContext(c.Request.Context(), "GetRoster failed",
			slog.String("coach_user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, roster)
}
