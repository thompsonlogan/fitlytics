// Package apierr provides RFC 9457 Problem Details for HTTP APIs. Every error
// response from the API uses the ProblemDetails struct so the frontend has one
// consistent shape to parse regardless of which endpoint returned the error.
package apierr

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ProblemDetails follows RFC 9457 (Problem Details for HTTP APIs). The `type`
// field is omitted when the problem has no stable URI; `instance` can
// optionally carry the request path for debugging.
//
// @Description RFC 9457 problem details returned for all non-2xx responses.
type ProblemDetails struct {
	// Type is a URI reference identifying the problem type. Omitted when no
	// stable identifier has been defined.
	Type string `json:"type,omitempty" example:"https://fitlytics.app/problems/not-found"`

	// Title is a short, human-readable summary of the problem type. Should
	// not change between occurrences.
	Title string `json:"title" example:"Not Found"`

	// Status is the HTTP status code for this occurrence.
	Status int `json:"status" example:"404"`

	// Detail is a human-readable explanation specific to this occurrence.
	Detail string `json:"detail" example:"program not found"`

	// Instance optionally identifies the specific occurrence (e.g. the
	// request path). Useful for correlating logs.
	Instance string `json:"instance,omitempty" example:"/api/programs/8d645f69-e0a2-4b07-a30b-0a20634e2abb"`
} // @name ProblemDetails

// Abort writes a ProblemDetails response and aborts the gin chain. Use in
// middleware where c.Abort is required.
func Abort(c *gin.Context, status int, detail string) {
	c.AbortWithStatusJSON(status, ProblemDetails{
		Title:    http.StatusText(status),
		Status:   status,
		Detail:   detail,
		Instance: c.Request.URL.Path,
	})
}

// Respond writes a ProblemDetails response without aborting. Use in handlers
// where the function returns after writing the error.
func Respond(c *gin.Context, status int, detail string) {
	c.JSON(status, ProblemDetails{
		Title:    http.StatusText(status),
		Status:   status,
		Detail:   detail,
		Instance: c.Request.URL.Path,
	})
}

// Convenience wrappers for common status codes. These read better at the call
// site than spelling out the status constant every time.

func BadRequest(c *gin.Context, detail string)          { Respond(c, http.StatusBadRequest, detail) }
func Unauthorized(c *gin.Context, detail string)        { Abort(c, http.StatusUnauthorized, detail) }
func NotFound(c *gin.Context, detail string)            { Respond(c, http.StatusNotFound, detail) }
func Conflict(c *gin.Context, detail string)            { Respond(c, http.StatusConflict, detail) }
func TooManyRequests(c *gin.Context, detail string)     { Respond(c, http.StatusTooManyRequests, detail) }
func ServiceUnavailable(c *gin.Context, detail string)  { Respond(c, http.StatusServiceUnavailable, detail) }
func InternalServerError(c *gin.Context, detail string) { Respond(c, http.StatusInternalServerError, detail) }
