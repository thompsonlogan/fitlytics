package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/access"
	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
)

const resourceOwnerKey = "access.resource_owner"

type ProgramOwnerResolver interface {
	GetProgramOwner(ctx context.Context, programID uuid.UUID) (uuid.UUID, error)
}

func RequireProgramRead(resolver ProgramOwnerResolver, checker *access.Checker, log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		programID, err := uuid.Parse(c.Param("id"))
		if err != nil {
			apierr.Abort(c, http.StatusBadRequest, "invalid program id")
			return
		}

		principal := auth.MustPrincipal(c)

		owner, err := resolver.GetProgramOwner(c.Request.Context(), programID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				apierr.Abort(c, http.StatusNotFound, "program not found")
				return
			}
			log.ErrorContext(c.Request.Context(), "resolve program owner failed",
				slog.String("program_id", programID.String()),
				slog.String("user_id", principal.User.ID.String()),
				slog.Any("error", err))
			apierr.Abort(c, http.StatusInternalServerError, "internal server error")
			return
		}

		if err := checker.RequireRead(c.Request.Context(), principal.User.ID, owner); err != nil {
			if errors.Is(err, apierr.ErrNotFound) {
				apierr.Abort(c, http.StatusNotFound, "program not found")
				return
			}
			log.ErrorContext(c.Request.Context(), "program access check failed",
				slog.String("program_id", programID.String()),
				slog.String("user_id", principal.User.ID.String()),
				slog.Any("error", err))
			apierr.Abort(c, http.StatusInternalServerError, "internal server error")
			return
		}

		SetResourceOwner(c, owner)
		c.Next()
	}
}

func SetResourceOwner(c *gin.Context, owner uuid.UUID) {
	c.Set(resourceOwnerKey, owner)
}

func MustResourceOwner(c *gin.Context) uuid.UUID {
	v, ok := c.Get(resourceOwnerKey)
	if !ok {
		panic("middleware.MustResourceOwner: handler is not behind a resource guard")
	}
	return v.(uuid.UUID)
}
