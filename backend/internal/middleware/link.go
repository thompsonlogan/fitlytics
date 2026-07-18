package middleware

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
)

type LinkParticipantChecker interface {
	IsLinkParticipant(ctx context.Context, linkID, userID uuid.UUID) (bool, error)
}

func RequireLinkParticipant(checker LinkParticipantChecker, log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		linkID, err := uuid.Parse(c.Param("linkId"))
		if err != nil {
			apierr.Abort(c, http.StatusBadRequest, "invalid link id")
			return
		}

		principal := auth.MustPrincipal(c)

		ok, err := checker.IsLinkParticipant(c.Request.Context(), linkID, principal.User.ID)
		if err != nil {
			log.ErrorContext(c.Request.Context(), "link membership check failed",
				slog.String("link_id", linkID.String()),
				slog.String("user_id", principal.User.ID.String()),
				slog.Any("error", err))
			apierr.Abort(c, http.StatusInternalServerError, "internal server error")
			return
		}
		if !ok {
			apierr.Abort(c, http.StatusNotFound, "link not found")
			return
		}

		c.Next()
	}
}
