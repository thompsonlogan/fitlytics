// Package handlers holds the HTTP handlers for the API endpoints.
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
)

// HealthResponse is the public readiness payload.
type HealthResponse struct {
	Status   string `json:"status" example:"ok"`
	Database string `json:"database" example:"up"`
} // @name HealthResponse

// Health is a public liveness/readiness probe that also verifies the DB
// connection. Returns 200 when healthy, 503 otherwise.
//
// @Summary      Check service health
// @Description  Verifies the API process is reachable and can ping the database.
// @Tags         Health
// @Produce      json
// @Success      200  {object}  HealthResponse
// @Failure      503  {object}  apierr.ProblemDetails  "database is unreachable"
// @Router       /healthz [get]
func Health(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sqlDB, err := db.DB()
		if err == nil {
			err = sqlDB.PingContext(c.Request.Context())
		}
		if err != nil {
			apierr.Respond(c, http.StatusServiceUnavailable, "database is unreachable")
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "database": "up"})
	}
}
