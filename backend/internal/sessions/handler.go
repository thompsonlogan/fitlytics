package sessions

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

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
// @Failure      400  {object}  SessionsErrorResponse  "invalid id"
// @Failure      401  {object}  SessionsErrorResponse  "missing or invalid auth token"
// @Failure      404  {object}  SessionsErrorResponse  "no current session"
// @Failure      500  {object}  SessionsErrorResponse  "internal server error"
// @Security     BearerAuth
// @Router       /api/programs/{id}/days/{dayId}/sessions/current [get]
func (h *Handler) GetCurrentSession(c *gin.Context) {
	_, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "invalid program id"})
		return
	}
	programDayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "invalid program day id"})
		return
	}

	principal := auth.MustPrincipal(c)

	session, err := h.service.FindCurrent(c.Request.Context(), programDayID, principal.User.ID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, ErrorResponse{Error: "no current session"})
			return
		}
		h.log.Error("find current session failed",
			slog.String("program_day_id", programDayID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "internal server error"})
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
// @Failure      400  {object}  SessionsErrorResponse  "invalid id"
// @Failure      401  {object}  SessionsErrorResponse  "missing or invalid auth token"
// @Failure      404  {object}  SessionsErrorResponse  "program day not found"
// @Failure      500  {object}  SessionsErrorResponse  "internal server error"
// @Security     BearerAuth
// @Router       /api/programs/{id}/days/{dayId}/sessions [post]
func (h *Handler) StartSession(c *gin.Context) {
	programID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "invalid program id"})
		return
	}
	programDayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "invalid program day id"})
		return
	}

	principal := auth.MustPrincipal(c)

	session, err := h.service.EnsureForDay(c.Request.Context(), programID, programDayID, principal.User.ID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, ErrorResponse{Error: "program day not found"})
			return
		}
		h.log.Error("ensure session failed",
			slog.String("program_id", programID.String()),
			slog.String("program_day_id", programDayID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "internal server error"})
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
// @Failure      400  {object}  SessionsErrorResponse  "invalid input"
// @Failure      401  {object}  SessionsErrorResponse  "missing or invalid auth token"
// @Failure      404  {object}  SessionsErrorResponse  "set log not found"
// @Failure      500  {object}  SessionsErrorResponse  "internal server error"
// @Security     BearerAuth
// @Router       /api/sessions/{sessionId}/set-logs/{setLogId} [patch]
func (h *Handler) UpdateSetLog(c *gin.Context) {
	sessionID, err := uuid.Parse(c.Param("sessionId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "invalid session id"})
		return
	}
	setLogID, err := uuid.Parse(c.Param("setLogId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "invalid set log id"})
		return
	}

	var body UpdateSetLogRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "invalid request body"})
		return
	}

	principal := auth.MustPrincipal(c)

	updated, err := h.service.UpdateSetLog(c.Request.Context(), sessionID, setLogID, principal.User.ID, body)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			c.JSON(http.StatusNotFound, ErrorResponse{Error: "set log not found"})
			return
		}
		if errors.Is(err, ErrInvalidInput) {
			c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
			return
		}
		h.log.Error("update set log failed",
			slog.String("session_id", sessionID.String()),
			slog.String("set_log_id", setLogID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: "internal server error"})
		return
	}

	c.JSON(http.StatusOK, updated)
}
