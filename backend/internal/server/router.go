// Package server wires the HTTP router and runs the API server.
package server

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/handlers"
	"github.com/thompsonlogan/fitlytics/backend/internal/middleware"
	"github.com/thompsonlogan/fitlytics/backend/internal/users"
)

// Dependencies are the wired-up services a router needs.
type Dependencies struct {
	DB       *gorm.DB
	Verifier *auth.Verifier
	Users    *users.Service
	Log      *slog.Logger
}

// NewRouter builds the Gin engine: a public health check plus an authenticated
// /api group guarded by the WorkOS auth middleware.
func NewRouter(deps Dependencies, isProduction bool) *gin.Engine {
	if isProduction {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(middleware.RequestLogger(deps.Log), gin.Recovery())

	// Public routes.
	r.GET("/healthz", handlers.Health(deps.DB))

	// Authenticated routes — every handler below can call auth.MustPrincipal.
	api := r.Group("/api")
	api.Use(middleware.RequireAuth(deps.Verifier, deps.Users, deps.Log))
	{
		api.GET("/me", handlers.Me())
		// Feature route groups (programs, sessions, exercises, ...) mount here.
	}

	return r
}
