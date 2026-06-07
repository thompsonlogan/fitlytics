// Package handlers holds the HTTP handlers for the API endpoints.
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
)

// Health is a public liveness/readiness probe that also verifies the DB
// connection. Returns 200 when healthy, 503 otherwise.
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
