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

// Handler is the HTTP layer for the program feature. Mounts routes onto a
// gin.RouterGroup that is already protected by the auth middleware.
type Handler struct {
	service Service
	log     *slog.Logger
}

// NewHandler wires the handler to its dependencies.
func NewHandler(service Service, log *slog.Logger) *Handler {
	return &Handler{service: service, log: log}
}

// Register mounts the program routes on the given (authenticated) router group.
func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.GET("/programs", h.List)
	rg.GET("/programs/:id", h.GetByID)
}

// List returns the bare program rows owned by the authenticated user, ordered
// by created_at ASC.
//
// @Summary      List the caller's programs
// @Description  Returns the lightweight program summaries (id, name, description, timestamps) for the authenticated user, ordered by created_at ASC. The frontend's program picker uses this to populate its list before fetching the full tree via GET /api/programs/{id}.
// @Tags         Programs
// @Produce      json
// @Success      200  {array}   ProgramSummaryResponse
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/programs [get]
func (h *Handler) List(c *gin.Context) {
	principal := auth.MustPrincipal(c)

	programs, err := h.service.ListByOwner(c.Request.Context(), principal.User.ID)
	if err != nil {
		h.log.Error("list programs failed",
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, programs)
}

// GetByID returns the full program tree for the authenticated user.
//
// @Summary      Get a program by id
// @Description  Returns the full program tree (program → weeks → days → exercises → set targets) for the authenticated user. The program must be owned by the caller; otherwise 404 is returned (existence is not leaked across users).
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
func (h *Handler) GetByID(c *gin.Context) {
	idParam := c.Param("id")
	programID, err := uuid.Parse(idParam)
	if err != nil {
		apierr.BadRequest(c, "invalid program id")
		return
	}

	principal := auth.MustPrincipal(c)

	program, err := h.service.GetFullTree(c.Request.Context(), programID, principal.User.ID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			apierr.NotFound(c, "program not found")
			return
		}
		h.log.Error("get program failed",
			slog.String("program_id", programID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, program)
}
