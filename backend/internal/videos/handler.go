package videos

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/middleware"
)

type Handler struct {
	service Service
	limits  Limits
	sessionRead   gin.HandlerFunc
	videoReviewer gin.HandlerFunc
	log           *slog.Logger
}

func NewHandler(service Service, limits Limits, sessionRead, videoReviewer gin.HandlerFunc, log *slog.Logger) *Handler {
	return &Handler{
		service:       service,
		limits:        limits,
		sessionRead:   sessionRead,
		videoReviewer: videoReviewer,
		log:           log,
	}
}

func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.GET("/sessions/:sessionId/videos", h.sessionRead, h.ListForSession)
	rg.POST("/videos/:videoId/reviewed", h.videoReviewer, h.MarkReviewed)

	rg.POST("/sessions/:sessionId/set-logs/:setLogId/videos", h.CreateUpload)
	rg.POST("/videos/:videoId/finalize", h.Finalize)
	rg.PATCH("/videos/:videoId", h.UpdateNote)
	rg.DELETE("/videos/:videoId", h.Delete)
}

// CreateUpload reserves a direct-to-storage upload for a set's video.
//
// @Summary      Reserve a video upload for a set
// @Description  Validates the declared content type and size against the configured limits, enforces per-user/per-day quotas, replaces any existing video on the set, and returns a one-time presigned PUT the client uploads to directly. The set log must roll up to a session owned by the caller and matching the path session id.
// @Tags         Videos
// @Accept       json
// @Produce      json
// @Param        sessionId  path      string                     true  "Session UUID"  Format(uuid)
// @Param        setLogId   path      string                     true  "Set log UUID"  Format(uuid)
// @Param        body       body      CreateVideoUploadRequest   true  "Upload metadata"
// @Success      201  {object}  CreateVideoUploadResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid input"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "set log not found"
// @Failure      429  {object}  apierr.ProblemDetails  "video quota exceeded"
// @Security     BearerAuth
// @Router       /api/sessions/{sessionId}/set-logs/{setLogId}/videos [post]
func (h *Handler) CreateUpload(c *gin.Context) {
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

	var body CreateVideoUploadRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		apierr.BadRequest(c, "invalid request body")
		return
	}

	principal := auth.MustPrincipal(c)
	resp, err := h.service.CreateUpload(c.Request.Context(), sessionID, setLogID, principal.User.ID, body)
	if err != nil {
		h.writeServiceError(c, "create video upload", err, slog.String("set_log_id", setLogID.String()), slog.String("user_id", principal.User.ID.String()))
		return
	}
	c.JSON(http.StatusCreated, resp)
}

// ListForSession returns every video attached to the session's sets.
//
// @Summary      List a session's set videos
// @Description  Returns all non-deleted videos whose set log belongs to the given session. Readable by the session's owner, or by a coach with an active link to them. Ready videos include a short-lived presigned playback URL.
// @Tags         Videos
// @Produce      json
// @Param        sessionId  path      string  true  "Session UUID"  Format(uuid)
// @Success      200  {array}   VideoResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid id"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "session not found"
// @Security     BearerAuth
// @Router       /api/sessions/{sessionId}/videos [get]
func (h *Handler) ListForSession(c *gin.Context) {
	sessionID, err := uuid.Parse(c.Param("sessionId"))
	if err != nil {
		apierr.BadRequest(c, "invalid session id")
		return
	}

	owner := middleware.MustResourceOwner(c)

	videos, err := h.service.ListForSession(c.Request.Context(), sessionID, owner)
	if err != nil {
		h.writeServiceError(c, "list session videos", err, slog.String("session_id", sessionID.String()), slog.String("owner_user_id", owner.String()))
		return
	}
	c.JSON(http.StatusOK, videos)
}

// MarkReviewed records that the calling coach has watched the video.
//
// @Summary      Mark a set video reviewed
// @Description  Stamps the video as reviewed by the calling coach, which is what clears it from the roster's "videos waiting" count. Only a coach with an active link to the video's owner may call this; the athlete marking their own footage reviewed would mean nothing. Already-reviewed and still-uploading videos answer 404, so the first reviewer's attribution cannot be overwritten.
// @Tags         Videos
// @Produce      json
// @Param        videoId  path      string  true  "Video UUID"  Format(uuid)
// @Success      200  {object}  VideoResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid id"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "video not found"
// @Security     BearerAuth
// @Router       /api/videos/{videoId}/reviewed [post]
func (h *Handler) MarkReviewed(c *gin.Context) {
	videoID, err := uuid.Parse(c.Param("videoId"))
	if err != nil {
		apierr.BadRequest(c, "invalid video id")
		return
	}

	reviewer := auth.MustPrincipal(c).User.ID

	video, err := h.service.MarkReviewed(c.Request.Context(), videoID, reviewer)
	if err != nil {
		h.writeServiceError(c, "mark video reviewed", err,
			slog.String("video_id", videoID.String()),
			slog.String("reviewer_user_id", reviewer.String()))
		return
	}
	c.JSON(http.StatusOK, video)
}

// Finalize verifies an upload landed and marks it ready.
//
// @Summary      Finalize a set video upload
// @Description  Called after the client finishes the direct upload. Verifies the object exists and is within the size limit (deleting and rejecting it otherwise), marks the video ready, and returns it with a playback URL.
// @Tags         Videos
// @Produce      json
// @Param        videoId  path      string  true  "Video UUID"  Format(uuid)
// @Success      200  {object}  VideoResponse
// @Failure      400  {object}  apierr.ProblemDetails  "upload missing or too large"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "video not found"
// @Security     BearerAuth
// @Router       /api/videos/{videoId}/finalize [post]
func (h *Handler) Finalize(c *gin.Context) {
	videoID, err := uuid.Parse(c.Param("videoId"))
	if err != nil {
		apierr.BadRequest(c, "invalid video id")
		return
	}

	principal := auth.MustPrincipal(c)
	video, err := h.service.Finalize(c.Request.Context(), videoID, principal.User.ID)
	if err != nil {
		h.writeServiceError(c, "finalize video", err, slog.String("video_id", videoID.String()), slog.String("user_id", principal.User.ID.String()))
		return
	}
	c.JSON(http.StatusOK, video)
}

// UpdateNote edits a video's note.
//
// @Summary      Update a set video's note
// @Tags         Videos
// @Accept       json
// @Produce      json
// @Param        videoId  path      string              true  "Video UUID"  Format(uuid)
// @Param        body     body      UpdateVideoRequest  true  "Fields to update"
// @Success      200  {object}  VideoResponse
// @Failure      400  {object}  apierr.ProblemDetails  "invalid input"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "video not found"
// @Security     BearerAuth
// @Router       /api/videos/{videoId} [patch]
func (h *Handler) UpdateNote(c *gin.Context) {
	videoID, err := uuid.Parse(c.Param("videoId"))
	if err != nil {
		apierr.BadRequest(c, "invalid video id")
		return
	}

	var body UpdateVideoRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		apierr.BadRequest(c, "invalid request body")
		return
	}

	principal := auth.MustPrincipal(c)
	video, err := h.service.UpdateNote(c.Request.Context(), videoID, principal.User.ID, body)
	if err != nil {
		h.writeServiceError(c, "update video note", err, slog.String("video_id", videoID.String()), slog.String("user_id", principal.User.ID.String()))
		return
	}
	c.JSON(http.StatusOK, video)
}

// Delete removes a set video.
//
// @Summary      Delete a set video
// @Description  Soft-deletes the row and purges the stored object.
// @Tags         Videos
// @Param        videoId  path      string  true  "Video UUID"  Format(uuid)
// @Success      204  "deleted"
// @Failure      400  {object}  apierr.ProblemDetails  "invalid id"
// @Failure      401  {object}  apierr.ProblemDetails  "missing or invalid auth token"
// @Failure      404  {object}  apierr.ProblemDetails  "video not found"
// @Security     BearerAuth
// @Router       /api/videos/{videoId} [delete]
func (h *Handler) Delete(c *gin.Context) {
	videoID, err := uuid.Parse(c.Param("videoId"))
	if err != nil {
		apierr.BadRequest(c, "invalid video id")
		return
	}

	principal := auth.MustPrincipal(c)
	if err := h.service.Delete(c.Request.Context(), videoID, principal.User.ID); err != nil {
		h.writeServiceError(c, "delete video", err, slog.String("video_id", videoID.String()), slog.String("user_id", principal.User.ID.String()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) writeServiceError(c *gin.Context, op string, err error, attrs ...slog.Attr) {
	switch {
	case errors.Is(err, apierr.ErrNotFound):
		apierr.NotFound(c, "video not found")
	case errors.Is(err, apierr.ErrInvalidInput):
		apierr.BadRequest(c, err.Error())
	case errors.Is(err, ErrQuotaExceeded):
		apierr.TooManyRequests(c, "video quota exceeded")
	default:
		logAttrs := append([]slog.Attr{slog.Any("error", err)}, attrs...)
		h.log.LogAttrs(c.Request.Context(), slog.LevelError, op+" failed", logAttrs...)
		apierr.InternalServerError(c, "internal server error")
	}
}
