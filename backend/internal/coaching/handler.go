package coaching

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
	service         Service
	linkParticipant gin.HandlerFunc
	log             *slog.Logger
}

func NewHandler(service Service, linkParticipant gin.HandlerFunc, log *slog.Logger) *Handler {
	return &Handler{service: service, linkParticipant: linkParticipant, log: log}
}

func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.GET("/athletes", h.GetRoster)
}

func (h *Handler) RegisterShared(rg *gin.RouterGroup) {
	rg.GET("/coaching/links", h.ListLinks)

	notes := rg.Group("/coaching/links/:linkId", h.linkParticipant)
	{
		notes.GET("/notes", h.ListNotes)
		notes.POST("/notes", h.CreateNote)
	}
}

// ListLinks returns the caller's active coaching relationships.
//
// @Summary      List the caller's coaching links
// @Description  Returns every active relationship the authenticated user is part of, from their point of view — the counterpart's identity and which side the caller is on. The link id addresses the shared notes thread.
// @Tags         Coaching
// @Produce      json
// @Success      200  {array}   CoachLinkResponse
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/coaching/links [get]
func (h *Handler) ListLinks(c *gin.Context) {
	principal := auth.MustPrincipal(c)

	links, err := h.service.ListLinks(c.Request.Context(), principal.User.ID)
	if err != nil {
		h.log.ErrorContext(c.Request.Context(), "ListLinks failed",
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, links)
}

// ListNotes returns the shared thread for a coaching relationship.
//
// @Summary      List a coaching thread
// @Description  Returns the notes on a coaching link, oldest first, interleaving both parties. Either party may read it; anyone else gets 404.
// @Tags         Coaching
// @Produce      json
// @Param        linkId  path      string  true  "Link UUID"  Format(uuid)
// @Success      200  {array}   CoachNoteResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid link id"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "link not found"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/coaching/links/{linkId}/notes [get]
func (h *Handler) ListNotes(c *gin.Context) {
	linkID, ok := parseUUIDParam(c, "linkId", "invalid link id")
	if !ok {
		return
	}

	notes, err := h.service.ListNotes(c.Request.Context(), linkID)
	if err != nil {
		h.log.ErrorContext(c.Request.Context(), "ListNotes failed",
			slog.String("link_id", linkID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusOK, notes)
}

// CreateNote posts a message to the shared thread.
//
// @Summary      Post to a coaching thread
// @Description  Adds a note to the relationship's thread. Either party may post. set_video_id is optional and is how the video review dialog's feedback keeps its context; it must reference a video belonging to the link's athlete.
// @Tags         Coaching
// @Accept       json
// @Produce      json
// @Param        linkId   path      string                  true  "Link UUID"  Format(uuid)
// @Param        request  body      CreateCoachNoteRequest  true  "The note"
// @Success      201  {object}  CoachNoteResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid request body"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "link not found"
// @Failure      500  {object}  apierr.ProblemDetails  "internal server error"
// @Security     BearerAuth
// @Router       /api/coaching/links/{linkId}/notes [post]
func (h *Handler) CreateNote(c *gin.Context) {
	linkID, ok := parseUUIDParam(c, "linkId", "invalid link id")
	if !ok {
		return
	}

	var body CreateCoachNoteRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		apierr.BadRequest(c, "invalid request body")
		return
	}

	principal := auth.MustPrincipal(c)

	note, err := h.service.CreateNote(c.Request.Context(), linkID, principal.User.ID, body)
	if err != nil {
		if errors.Is(err, apierr.ErrInvalidInput) {
			apierr.BadRequest(c, err.Error())
			return
		}
		if errors.Is(err, apierr.ErrNotFound) {
			apierr.NotFound(c, "link not found")
			return
		}
		h.log.ErrorContext(c.Request.Context(), "CreateNote failed",
			slog.String("link_id", linkID.String()),
			slog.String("user_id", principal.User.ID.String()),
			slog.Any("error", err),
		)
		apierr.InternalServerError(c, "internal server error")
		return
	}

	c.JSON(http.StatusCreated, note)
}

func parseUUIDParam(c *gin.Context, name, message string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		apierr.BadRequest(c, message)
		return uuid.Nil, false
	}
	return id, true
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
