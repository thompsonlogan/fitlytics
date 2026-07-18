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

type OwnerResolver interface {
	Owner(ctx context.Context, resourceID uuid.UUID) (uuid.UUID, error)
}

type OwnerResolverFunc func(ctx context.Context, resourceID uuid.UUID) (uuid.UUID, error)

func (f OwnerResolverFunc) Owner(ctx context.Context, resourceID uuid.UUID) (uuid.UUID, error) {
	return f(ctx, resourceID)
}

type ProgramOwnerResolver interface {
	GetProgramOwner(ctx context.Context, programID uuid.UUID) (uuid.UUID, error)
}

func RequireProgramRead(resolver ProgramOwnerResolver, checker *access.Checker, log *slog.Logger) gin.HandlerFunc {
	return resourceGuard(guardConfig{
		param:    "id",
		notFound: "program not found",
		resolve:  OwnerResolverFunc(resolver.GetProgramOwner),
		authorize: func(ctx context.Context, callerID, ownerID uuid.UUID) error {
			return checker.RequireRead(ctx, callerID, ownerID)
		},
		log: log,
	})
}

type SessionOwnerResolver interface {
	GetSessionOwner(ctx context.Context, sessionID uuid.UUID) (uuid.UUID, error)
}

func RequireSessionRead(resolver SessionOwnerResolver, checker *access.Checker, log *slog.Logger) gin.HandlerFunc {
	return resourceGuard(guardConfig{
		param:    "sessionId",
		notFound: "session not found",
		resolve:  OwnerResolverFunc(resolver.GetSessionOwner),
		authorize: func(ctx context.Context, callerID, ownerID uuid.UUID) error {
			return checker.RequireRead(ctx, callerID, ownerID)
		},
		log: log,
	})
}

type VideoOwnerResolver interface {
	GetVideoOwner(ctx context.Context, videoID uuid.UUID) (uuid.UUID, error)
}

func RequireVideoReviewer(resolver VideoOwnerResolver, checker *access.Checker, log *slog.Logger) gin.HandlerFunc {
	return resourceGuard(guardConfig{
		param:     "videoId",
		notFound:  "video not found",
		resolve:   OwnerResolverFunc(resolver.GetVideoOwner),
		authorize: checker.RequireCoach,
		log:       log,
	})
}

type guardConfig struct {
	param     string
	notFound  string
	resolve   OwnerResolver
	authorize func(ctx context.Context, callerID, ownerID uuid.UUID) error
	log       *slog.Logger
}

func resourceGuard(cfg guardConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		resourceID, err := uuid.Parse(c.Param(cfg.param))
		if err != nil {
			apierr.Abort(c, http.StatusBadRequest, "invalid "+cfg.param)
			return
		}

		principal := auth.MustPrincipal(c)

		owner, err := cfg.resolve.Owner(c.Request.Context(), resourceID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				apierr.Abort(c, http.StatusNotFound, cfg.notFound)
				return
			}
			cfg.log.ErrorContext(c.Request.Context(), "resolve resource owner failed",
				slog.String("param", cfg.param),
				slog.String("resource_id", resourceID.String()),
				slog.String("user_id", principal.User.ID.String()),
				slog.Any("error", err))
			apierr.Abort(c, http.StatusInternalServerError, "internal server error")
			return
		}

		if err := cfg.authorize(c.Request.Context(), principal.User.ID, owner); err != nil {
			if errors.Is(err, apierr.ErrNotFound) {
				apierr.Abort(c, http.StatusNotFound, cfg.notFound)
				return
			}
			cfg.log.ErrorContext(c.Request.Context(), "resource access check failed",
				slog.String("param", cfg.param),
				slog.String("resource_id", resourceID.String()),
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
