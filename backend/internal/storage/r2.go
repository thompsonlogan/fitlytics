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

type R2Config struct {
	Endpoint        string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
}

type R2Store struct {
	client  *s3.Client
	presign *s3.PresignClient
	bucket  string
}

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

	headers := make(map[string]string, len(req.SignedHeader))
	for k := range req.SignedHeader {
		headers[k] = req.SignedHeader.Get(k)
	}

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
