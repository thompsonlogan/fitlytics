// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"os"
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
