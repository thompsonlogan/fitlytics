package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/logger"
)

// RequestIDHeader is accepted from the edge proxy (nginx sets it from
// $request_id) and echoed on the response so clients can report it.
const RequestIDHeader = "X-Request-ID"

// maxRequestIDLen guards against abusive header values when the API is hit
// without the proxy in front.
const maxRequestIDLen = 64

// RequestID ensures every request has an id: reuse the inbound header when
// present (trusted edge), otherwise mint a UUID. The id is stored on the
// request context for the logger and echoed in the response headers.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(RequestIDHeader)
		if id == "" || len(id) > maxRequestIDLen {
			id = uuid.NewString()
		}
		c.Request = c.Request.WithContext(logger.WithRequestID(c.Request.Context(), id))
		c.Writer.Header().Set(RequestIDHeader, id)
		c.Next()
	}
}
