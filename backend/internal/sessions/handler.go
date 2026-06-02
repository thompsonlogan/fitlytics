package sessions

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
)

// Handler is the HTTP layer for the sessions feature. Mounts routes onto a
// gin.RouterGroup already protected by the auth middleware.
type Handler struct {
	service Service
	log     *slog.Logger
}

// NewHandler wires the handler to its dependencies.
func NewHandler(service Service, log *slog.Logger) *Handler {
	return &Handler{service: service, log: log}
}

// Register mounts the session routes on the given (authenticated) group.
func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.GET("/programs/:id/days/:dayId/sessions/current", h.GetCurrentSession)
	rg.POST("/programs/:id/days/:dayId/sessions", h.StartSession)
	rg.PATCH("/sessions/:sessionId/set-logs/:setLogId", h.UpdateSetLog)
	rg.GET("/programs/:id/day-completions", h.ListDayCompletions)
}

// GetCurrentSession returns the active session for the day, or 404 if the
// user hasn't started one yet.
//
// @Summary      Get the active session for a program day
// @Description  Returns the most recent non-deleted session for the authenticated user on the given program day. 404 if none exists — the FE uses this to populate cell actuals on first render of a day without creating a session for users who are just browsing.
// @Tags         Sessions
// @Produce      json
// @Param        id      path      string  true  "Program UUID"      Format(uuid)
// @Param        dayId   path      string  true  "Program day UUID"  Format(uuid)
// @Success      200  {object}  SessionResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid id"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "no current session"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/programs/{id}/days/{dayId}/sessions/current [get]
func (h *Handler) GetCurrentSession(c *gin.Context) {
	_, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierr.BadRequest(c, "invalid program id")
		return
	}
	programDayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		apierr.BadRequest(c, "invalid program day id")
		return
	}

	principal := auth.MustPrincipal(c)

	session, err := h.service.FindCurrent(c.Request.Context(), programDayID, principal.User.ID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			apierr.NotFound(c, "no current session")
			return
		}
		h.log.Error("find current session failed",
			slog.String("program_day_id", programDayID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, session)
}

// StartSession finds or creates the session for a day. Idempotent — calling
// it twice returns the same session.
//
// @Summary      Start (or return) a session for a program day
// @Description  Finds the user's active session for this day and returns it. If none exists, creates one by snapshotting the day's prescription into session_exercises and set_logs (one log per program_set_target). Designed to be called the first time the user interacts with a cell; repeat calls are no-ops.
// @Tags         Sessions
// @Produce      json
// @Param        id      path      string  true  "Program UUID"      Format(uuid)
// @Param        dayId   path      string  true  "Program day UUID"  Format(uuid)
// @Success      200  {object}  SessionResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid id"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "program day not found"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/programs/{id}/days/{dayId}/sessions [post]
func (h *Handler) StartSession(c *gin.Context) {
	programID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierr.BadRequest(c, "invalid program id")
		return
	}
	programDayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		apierr.BadRequest(c, "invalid program day id")
		return
	}

	principal := auth.MustPrincipal(c)

	session, err := h.service.EnsureForDay(c.Request.Context(), programID, programDayID, principal.User.ID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			apierr.NotFound(c, "program day not found")
			return
		}
		h.log.Error("ensure session failed",
			slog.String("program_id", programID.String()),
			slog.String("program_day_id", programDayID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, session)
}

// UpdateSetLog writes the user's actuals to one set_logs row.
//
// @Summary      Update actuals on one set log
// @Description  Partial update of a single set_logs row. Only the fields included in the body are written; omitted fields stay untouched. The set log must roll up to a session owned by the caller and matching the path session id; otherwise 404.
// @Tags         Sessions
// @Accept       json
// @Produce      json
// @Param        sessionId  path      string                true  "Session UUID"  Format(uuid)
// @Param        setLogId   path      string                true  "Set log UUID"  Format(uuid)
// @Param        body       body      UpdateSetLogRequest   true  "Actuals to write"
// @Success      200  {object}  SetLogResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid input"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "set log not found"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/sessions/{sessionId}/set-logs/{setLogId} [patch]
func (h *Handler) UpdateSetLog(c *gin.Context) {
	sessionID, err := uuid.Parse(c.Param("sessionId"))
	if err != nil {
		apierr.BadRequest(c, "invalid session id")
		return
	}
	setLogID, err := uuid.Parse(c.Param("setLogId"))
	if err != nil {
		apierr.BadRequest(c, "invalid set log id")
		return
	}

	var body UpdateSetLogRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		apierr.BadRequest(c, "invalid request body")
		return
	}

	principal := auth.MustPrincipal(c)

	updated, err := h.service.UpdateSetLog(c.Request.Context(), sessionID, setLogID, principal.User.ID, body)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			apierr.NotFound(c, "set log not found")
			return
		}
		if errors.Is(err, ErrInvalidInput) {
			apierr.BadRequest(c, err.Error())
			return
		}
		h.log.Error("update set log failed",
			slog.String("session_id", sessionID.String()),
			slog.String("set_log_id", setLogID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, updated)
}

// ListDayCompletions returns the (week, day) sequence pairs for sessions in
// this program that have rolled to state='completed'.
//
// @Summary      List completed days for a program
// @Description  Returns one entry per program day where the user's session has reached state='completed' (every set is either completed or skipped). The day selector renders a "done" dot for each pair. Cheap to compute — single index-friendly query against sessions joined to program_weeks/program_days.
// @Tags         Sessions
// @Produce      json
// @Param        id  path      string  true  "Program UUID"  Format(uuid)
// @Success      200  {array}   CompletedDayResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid id"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/programs/{id}/day-completions [get]
func (h *Handler) ListDayCompletions(c *gin.Context) {
	programID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		apierr.BadRequest(c, "invalid program id")
		return
	}

	principal := auth.MustPrincipal(c)

	rows, err := h.service.ListCompletedDays(c.Request.Context(), programID, principal.User.ID)
	if err != nil {
		h.log.Error("list day completions failed",
			slog.String("program_id", programID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, rows)
}
