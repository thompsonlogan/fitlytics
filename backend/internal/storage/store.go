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

var ErrNotFound = errors.New("storage: object not found")

type PresignedUpload struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}

type HeadResult struct {
	SizeBytes   int64
	ContentType string
}

type ObjectStore interface {
	PresignPut(ctx context.Context, key, contentType string, size int64, ttl time.Duration) (PresignedUpload, error)
	PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error)
	Head(ctx context.Context, key string) (HeadResult, error)
	Delete(ctx context.Context, key string) error
}
