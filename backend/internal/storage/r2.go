package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	smithy "github.com/aws/smithy-go"
)

// R2Config holds the connection settings for a Cloudflare R2 bucket. R2 speaks
// the S3 API, so we drive it with aws-sdk-go-v2 pointed at the R2 endpoint.
type R2Config struct {
	Endpoint        string // https://<account>.r2.cloudflarestorage.com
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
}

// R2Store is an ObjectStore backed by Cloudflare R2.
type R2Store struct {
	client  *s3.Client
	presign *s3.PresignClient
	bucket  string
}

// NewR2Store builds an R2-backed ObjectStore. R2 ignores the region but the SDK
// requires one, so we pass the conventional "auto". Path-style addressing is
// used because R2 does not support virtual-hosted-style buckets.
func NewR2Store(cfg R2Config) (*R2Store, error) {
	if cfg.Endpoint == "" || cfg.Bucket == "" || cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" {
		return nil, errors.New("storage: incomplete R2 configuration")
	}

	awsCfg := aws.Config{
		Region:      "auto",
		Credentials: credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = true
	})

	return &R2Store{
		client:  client,
		presign: s3.NewPresignClient(client),
		bucket:  cfg.Bucket,
	}, nil
}

func (s *R2Store) PresignPut(ctx context.Context, key, contentType string, size int64, ttl time.Duration) (PresignedUpload, error) {
	in := &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
	}
	req, err := s.presign.PresignPutObject(ctx, in, s3.WithPresignExpires(ttl))
	if err != nil {
		return PresignedUpload{}, fmt.Errorf("presign put: %w", err)
	}

	// Return every header the SDK bound into the signature so the client can
	// replay them verbatim — Content-Type and Content-Length included, which is
	// what enforces the type and size constraints at the store.
	headers := make(map[string]string, len(req.SignedHeader))
	for k := range req.SignedHeader {
		headers[k] = req.SignedHeader.Get(k)
	}
	// Browsers don't always echo a signed content-length header; make the
	// expected value explicit so the client can set it on the PUT.
	if _, ok := headers["Content-Length"]; !ok {
		headers["Content-Length"] = fmt.Sprintf("%d", size)
	}
	if _, ok := headers["Content-Type"]; !ok {
		headers["Content-Type"] = contentType
	}

	return PresignedUpload{URL: req.URL, Method: req.Method, Headers: headers}, nil
}

func (s *R2Store) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	req, err := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("presign get: %w", err)
	}
	return req.URL, nil
}

func (s *R2Store) Head(ctx context.Context, key string) (HeadResult, error) {
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		var notFound *types.NotFound
		if errors.As(err, &notFound) {
			return HeadResult{}, fmt.Errorf("head object %q: %w", key, ErrNotFound)
		}
		// Some S3-compatible stores surface HeadObject 404s only as a generic
		// API error with code NotFound/NoSuchKey.
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) {
			code := apiErr.ErrorCode()
			if code == "NotFound" || code == "NoSuchKey" {
				return HeadResult{}, fmt.Errorf("head object %q: %w", key, ErrNotFound)
			}
		}
		return HeadResult{}, fmt.Errorf("head object: %w", err)
	}
	res := HeadResult{}
	if out.ContentLength != nil {
		res.SizeBytes = *out.ContentLength
	}
	if out.ContentType != nil {
		res.ContentType = *out.ContentType
	}
	return res, nil
}

func (s *R2Store) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}
