// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Env         string
	HTTPPort    string
	DatabaseURL string
	LogLevel    string

	WorkOSAPIKey   string
	WorkOSClientID string
	// JWKSURL and JWTIssuer are derived from WorkOSClientID unless explicitly overridden.
	JWKSURL           string
	JWTIssuer         string
	WorkOSRedirectURI string
	AppURL            string
	AuthBypassUserID  string
	R2Endpoint        string
	R2Bucket          string
	R2AccessKeyID     string
	R2SecretAccessKey string
	MaxVideoBytes     int64
	MaxVideosPerUser  int
	MaxVideosPerDay   int
}

func (c Config) IsProduction() bool { return c.Env == "production" }

func Load() (Config, error) {
	_ = godotenv.Load()

	var invalid []string
	maxVideoBytes, err := envInt64("MAX_VIDEO_BYTES", 500*1024*1024) // 500 MB
	if err != nil {
		invalid = append(invalid, err.Error())
	}
	maxVideosPerUser, err := envInt("MAX_VIDEOS_PER_USER", 200)
	if err != nil {
		invalid = append(invalid, err.Error())
	}
	maxVideosPerDay, err := envInt("MAX_VIDEOS_PER_DAY", 50)
	if err != nil {
		invalid = append(invalid, err.Error())
	}

	c := Config{
		Env:               env("APP_ENV", "development"),
		HTTPPort:          env("HTTP_PORT", "8080"),
		DatabaseURL:       env("DATABASE_URL", ""),
		LogLevel:          env("LOG_LEVEL", "info"),
		WorkOSAPIKey:      env("WORKOS_API_KEY", ""),
		WorkOSClientID:    env("WORKOS_CLIENT_ID", ""),
		JWKSURL:           env("WORKOS_JWKS_URL", ""),
		JWTIssuer:         env("WORKOS_JWT_ISSUER", ""),
		WorkOSRedirectURI: env("WORKOS_REDIRECT_URI", ""),
		AppURL:            env("APP_URL", ""),
		AuthBypassUserID:  env("AUTH_BYPASS_USER_ID", ""),

		R2Endpoint:        env("R2_ENDPOINT", ""),
		R2Bucket:          env("R2_BUCKET", ""),
		R2AccessKeyID:     env("R2_ACCESS_KEY_ID", ""),
		R2SecretAccessKey: env("R2_SECRET_ACCESS_KEY", ""),
		MaxVideoBytes:     maxVideoBytes,
		MaxVideosPerUser:  maxVideosPerUser,
		MaxVideosPerDay:   maxVideosPerDay,
	}

	var missing []string
	if strings.TrimSpace(c.HTTPPort) == "" {
		invalid = append(invalid, "HTTP_PORT must be non-empty")
	}
	if c.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if c.WorkOSAPIKey == "" {
		missing = append(missing, "WORKOS_API_KEY")
	}
	if c.WorkOSClientID == "" {
		missing = append(missing, "WORKOS_CLIENT_ID")
	}
	if c.WorkOSRedirectURI == "" {
		missing = append(missing, "WORKOS_REDIRECT_URI")
	}
	if c.AppURL == "" {
		missing = append(missing, "APP_URL")
	}
	if c.R2Endpoint == "" {
		missing = append(missing, "R2_ENDPOINT")
	}
	if c.R2Bucket == "" {
		missing = append(missing, "R2_BUCKET")
	}
	if c.R2AccessKeyID == "" {
		missing = append(missing, "R2_ACCESS_KEY_ID")
	}
	if c.R2SecretAccessKey == "" {
		missing = append(missing, "R2_SECRET_ACCESS_KEY")
	}
	if c.MaxVideoBytes <= 0 {
		invalid = append(invalid, "MAX_VIDEO_BYTES must be positive")
	}
	if c.MaxVideosPerUser <= 0 {
		invalid = append(invalid, "MAX_VIDEOS_PER_USER must be positive")
	}
	if c.MaxVideosPerDay <= 0 {
		invalid = append(invalid, "MAX_VIDEOS_PER_DAY must be positive")
	}
	if len(missing) > 0 || len(invalid) > 0 {
		var problems []string
		if len(missing) > 0 {
			problems = append(problems, "missing required env vars: "+strings.Join(missing, ", "))
		}
		problems = append(problems, invalid...)
		return Config{}, fmt.Errorf("invalid config: %s", strings.Join(problems, "; "))
	}
	if c.JWKSURL == "" {
		c.JWKSURL = "https://api.workos.com/sso/jwks/" + c.WorkOSClientID
	}
	if c.JWTIssuer == "" {
		c.JWTIssuer = "https://api.workos.com/user_management/" + c.WorkOSClientID
	}

	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) (int, error) {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return 0, fmt.Errorf("%s must be an integer", key)
		}
		return n, nil
	}
	return fallback, nil
}

func envInt64(key string, fallback int64) (int64, error) {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("%s must be an integer", key)
		}
		return n, nil
	}
	return fallback, nil
}
