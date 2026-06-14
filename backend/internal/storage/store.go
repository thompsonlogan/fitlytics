// Package storage abstracts the object store used to hold user-uploaded files
// (currently set videos in Cloudflare R2). The ObjectStore interface keeps the
// videos service decoupled from the concrete S3/R2 client so it can be faked in
// tests, and so a different backend (R2, S3, GCS) could be swapped in later.
package storage

import (
	"context"
	"errors"
	"time"
)

// ErrNotFound is returned by Head when the object does not exist (as opposed
// to a transient store failure). Callers branch on it with errors.Is.
var ErrNotFound = errors.New("storage: object not found")

// PresignedUpload describes a single, short-lived direct-to-store upload. The
// browser performs one HTTP request to URL using Method and MUST send exactly
// the headers in Headers (Content-Type / Content-Length are bound into the
// signature, so any mismatch is rejected by the store) — this is what enforces
// the content-type and size safeguards without the bytes ever touching our API.
type PresignedUpload struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}

// HeadResult is the subset of object metadata the videos service needs to
// verify an upload after the fact (re-checking the real size against the cap).
type HeadResult struct {
	SizeBytes   int64
	ContentType string
}

// ObjectStore is the minimal surface the videos feature needs.
type ObjectStore interface {
	// PresignPut returns a one-time upload URL for key, binding contentType and
	// size into the signature and expiring after ttl.
	PresignPut(ctx context.Context, key, contentType string, size int64, ttl time.Duration) (PresignedUpload, error)
	// PresignGet returns a short-lived read URL for key, used for playback.
	PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error)
	// Head returns the stored object's metadata. Returns an error wrapping ErrNotFound when the object does not exist; any other error is a store failure and may be transient.
	Head(ctx context.Context, key string) (HeadResult, error)
	// Delete removes the object. Deleting a missing key is not an error.
	Delete(ctx context.Context, key string) error
}
