// Package server wires the HTTP router and runs the API server.
package server

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/handlers"
	"github.com/thompsonlogan/fitlytics/backend/internal/middleware"
	"github.com/thompsonlogan/fitlytics/backend/internal/programs"
	"github.com/thompsonlogan/fitlytics/backend/internal/users"
)

// Dependencies are the wired-up services a router needs.
type Dependencies struct {
	DB       *gorm.DB
	Verifier *auth.Verifier
	Users    *users.Service
	Log      *slog.Logger
	Auth     handlers.AuthDeps
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

	// AuthKit flow: login redirects to WorkOS, callback exchanges the code and
	// sets session cookies, refresh swaps the refresh-token cookie for a fresh
	// access token, logout clears both cookies. None of these can sit behind
	// RequireAuth — by definition the user has no session yet (or wants to end
	// the one they have).
	r.GET("/auth/login", handlers.AuthLogin(deps.Auth))
	r.GET("/auth/callback", handlers.AuthCallback(deps.Auth))
	r.POST("/auth/refresh", handlers.AuthRefresh(deps.Auth))
	r.POST("/auth/logout", handlers.AuthLogout(deps.Auth))

	// Swagger UI — dev/staging only. The generated spec lives in backend/docs
	// and is registered via the blank import in cmd/api/main.go.
	if !isProduction {
		r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	// Feature wiring. The repository/service/handler triad is built here so
	// each feature can be tested in isolation without booting the router.
	programsRepo := programs.NewRepository(deps.DB)
	programsSvc := programs.NewService(programsRepo)
	programsHandler := programs.NewHandler(programsSvc, deps.Log)

	// Authenticated routes — every handler below can call auth.MustPrincipal.
	api := r.Group("/api")
	api.Use(middleware.RequireAuth(deps.Verifier, deps.Users, deps.Log))
	{
		api.GET("/me", handlers.Me())
		programsHandler.Register(api)
	}

	return r
}
