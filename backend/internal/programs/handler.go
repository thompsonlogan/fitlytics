package programs

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

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
	rg.GET("/programs", h.GetProgramsByUserId)
	rg.GET("/programs/:id", h.GetProgramById)
}

// GetProgramsByUserId returns the bare program rows owned by the authenticated user, ordered
// by created_at ASC.
//
// @Summary      List the caller's programs
// @Description  Returns the lightweight program summaries (id, name, description, timestamps) for the authenticated user, ordered by created_at ASC.
// @Tags         Programs
// @Produce      json
// @Success      200  {array}   ProgramSummaryResponse
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/programs [get]
func (h *Handler) GetProgramsByUserId(c *gin.Context) {
	principal := auth.MustPrincipal(c)

	programs, err := h.service.GetProgramsByUserId(c.Request.Context(), principal.User.ID)
	if err != nil {
		h.log.ErrorContext(c.Request.Context(), "GetProgramsByUserId failed",
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, programs)
}

// GetProgramById returns the full program tree for the authenticated user.
//
// @Summary      Get a program by id
// @Description  Returns the full program tree (program → weeks → days → exercises → set targets) for the authenticated user.
// @Tags         Programs
// @Produce      json
// @Param        id   path      string  true  "Program UUID"  Format(uuid)
// @Success      200  {object}  ProgramResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid program id"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "program not found"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/programs/{id} [get]
func (h *Handler) GetProgramById(c *gin.Context) {
	idParam := c.Param("id")
	programID, err := uuid.Parse(idParam)
	if err != nil {
		apierr.BadRequest(c, "invalid program id")
		return
	}

	principal := auth.MustPrincipal(c)

	program, err := h.service.GetProgramById(c.Request.Context(), programID, principal.User.ID)
	if err != nil {
		if errors.Is(err, apierr.ErrNotFound) {
			apierr.NotFound(c, "program not found")
			return
		}
		h.log.ErrorContext(c.Request.Context(), "GetProgramById failed",
			slog.String("program_id", programID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, program)
}
