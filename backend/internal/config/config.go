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
	Env         string // "development" or "production"
	HTTPPort    string
	DatabaseURL string
	LogLevel    string // "debug" | "info" | "warn" | "error"

	WorkOSAPIKey   string
	WorkOSClientID string
	// JWKSURL and JWTIssuer are derived from WorkOSClientID unless explicitly overridden.
	JWKSURL   string
	JWTIssuer string

	// WorkOSRedirectURI is the absolute URL AuthKit will redirect back to with
	// an authorization code (e.g. http://localhost:8080/auth/callback). Must be
	// registered in the WorkOS dashboard under Redirects.
	WorkOSRedirectURI string

	// AppURL is the absolute URL of the SPA. The callback handler bounces the
	// user back here after a successful sign-in (e.g. http://localhost:5173).
	AppURL string

	// AuthBypassUserID, when set (development only), skips WorkOS JWT
	// verification and authenticates every request as this local user.
	// Set to the users.id UUID from the database.
	AuthBypassUserID string

	// ── Set video upload (Cloudflare R2) ──────────────────────────────────────
	// All four are required — the app fails to start if any is missing.
	R2Endpoint        string // https://<account>.r2.cloudflarestorage.com
	R2Bucket          string
	R2AccessKeyID     string
	R2SecretAccessKey string

	// MaxVideoBytes caps a single upload (default 500 MB). MaxVideosPerUser and
	// MaxVideosPerDay bound how many a user can accumulate to prevent abuse.
	MaxVideoBytes    int64
	MaxVideosPerUser int
	MaxVideosPerDay  int
}

func (c Config) IsProduction() bool { return c.Env == "production" }

// Load reads configuration from the environment. In development a local .env
// file (if present) is loaded first; in production env vars are expected to be
// set by the deployment platform.
func Load() (Config, error) {
	_ = godotenv.Load() // best-effort; absent file is not an error

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
		MaxVideoBytes:     envInt64("MAX_VIDEO_BYTES", 500*1024*1024), // 500 MB
		MaxVideosPerUser:  envInt("MAX_VIDEOS_PER_USER", 200),
		MaxVideosPerDay:   envInt("MAX_VIDEOS_PER_DAY", 50),
	}

	var missing []string
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
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required env vars: %s", strings.Join(missing, ", "))
	}

	// WorkOS publishes the signing keys for access tokens per client id.
	if c.JWKSURL == "" {
		c.JWKSURL = "https://api.workos.com/sso/jwks/" + c.WorkOSClientID
	}
	// Access tokens issued by AuthKit carry this issuer. Verify the exact value
	// for your environment by decoding a real token (jwt.io) if auth rejects
	// valid tokens; override with WORKOS_JWT_ISSUER if it differs.
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

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return fallback
}
