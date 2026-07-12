package config

import (
	"strings"
	"testing"
	"time"
)

func setRequiredEnv(t *testing.T) {
	t.Helper()

	t.Setenv("DATABASE_URL", "postgres://fitlytics:fitlytics@localhost:5432/fitlytics")
	t.Setenv("WORKOS_API_KEY", "workos-api-key")
	t.Setenv("WORKOS_CLIENT_ID", "client_123")
	t.Setenv("WORKOS_REDIRECT_URI", "http://localhost:8080/auth/callback")
	t.Setenv("APP_URL", "http://localhost:5173")
	t.Setenv("R2_ENDPOINT", "https://account.r2.cloudflarestorage.com")
	t.Setenv("R2_BUCKET", "set-videos")
	t.Setenv("R2_ACCESS_KEY_ID", "r2-access-key")
	t.Setenv("R2_SECRET_ACCESS_KEY", "r2-secret-key")

	t.Setenv("APP_ENV", "")
	t.Setenv("HTTP_PORT", "")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("AUTH_BYPASS_USER_ID", "")
	t.Setenv("WORKOS_JWKS_URL", "")
	t.Setenv("WORKOS_JWT_ISSUER", "")
	t.Setenv("MAX_VIDEO_BYTES", "")
	t.Setenv("MAX_VIDEOS_PER_USER", "")
	t.Setenv("MAX_VIDEOS_PER_DAY", "")
	t.Setenv("DB_MAX_OPEN_CONNS", "")
	t.Setenv("DB_MAX_IDLE_CONNS", "")
	t.Setenv("DB_CONN_MAX_LIFETIME_MINUTES", "")
}

func TestLoadUsesOptionalDefaults(t *testing.T) {
	setRequiredEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Env != "development" {
		t.Errorf("Env = %q, want development", cfg.Env)
	}
	if cfg.HTTPPort != "8080" {
		t.Errorf("HTTPPort = %q, want 8080", cfg.HTTPPort)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel = %q, want info", cfg.LogLevel)
	}
	if cfg.MaxVideoBytes != 500*1024*1024 {
		t.Errorf("MaxVideoBytes = %d, want default", cfg.MaxVideoBytes)
	}
	if cfg.MaxVideosPerUser != 200 {
		t.Errorf("MaxVideosPerUser = %d, want 200", cfg.MaxVideosPerUser)
	}
	if cfg.MaxVideosPerDay != 50 {
		t.Errorf("MaxVideosPerDay = %d, want 50", cfg.MaxVideosPerDay)
	}
	if cfg.DBMaxOpenConns != 25 {
		t.Errorf("DBMaxOpenConns = %d, want 25", cfg.DBMaxOpenConns)
	}
	if cfg.DBMaxIdleConns != 5 {
		t.Errorf("DBMaxIdleConns = %d, want 5", cfg.DBMaxIdleConns)
	}
	if cfg.DBConnMaxLifetime != 60*time.Minute {
		t.Errorf("DBConnMaxLifetime = %v, want 60m", cfg.DBConnMaxLifetime)
	}
	if cfg.JWKSURL != "https://api.workos.com/sso/jwks/client_123" {
		t.Errorf("JWKSURL = %q", cfg.JWKSURL)
	}
	if cfg.JWTIssuer != "https://api.workos.com/user_management/client_123" {
		t.Errorf("JWTIssuer = %q", cfg.JWTIssuer)
	}
}

func TestLoadRejectsInvalidIntegerEnv(t *testing.T) {
	tests := []string{
		"MAX_VIDEO_BYTES",
		"MAX_VIDEOS_PER_USER",
		"MAX_VIDEOS_PER_DAY",
		"DB_MAX_OPEN_CONNS",
		"DB_MAX_IDLE_CONNS",
		"DB_CONN_MAX_LIFETIME_MINUTES",
	}

	for _, key := range tests {
		t.Run(key, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(key, "abc")

			_, err := Load()
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), key) {
				t.Fatalf("error %q does not name %s", err.Error(), key)
			}
			if strings.Contains(err.Error(), "abc") {
				t.Fatalf("error exposes invalid value: %q", err.Error())
			}
		})
	}
}

func TestLoadDBPoolOverrides(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("DB_MAX_OPEN_CONNS", "10")
	t.Setenv("DB_MAX_IDLE_CONNS", "2")
	t.Setenv("DB_CONN_MAX_LIFETIME_MINUTES", "5")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DBMaxOpenConns != 10 {
		t.Errorf("DBMaxOpenConns = %d, want 10", cfg.DBMaxOpenConns)
	}
	if cfg.DBMaxIdleConns != 2 {
		t.Errorf("DBMaxIdleConns = %d, want 2", cfg.DBMaxIdleConns)
	}
	if cfg.DBConnMaxLifetime != 5*time.Minute {
		t.Errorf("DBConnMaxLifetime = %v, want 5m", cfg.DBConnMaxLifetime)
	}
}

func TestLoadRejectsIdleExceedingOpen(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("DB_MAX_OPEN_CONNS", "10")
	t.Setenv("DB_MAX_IDLE_CONNS", "30")

	_, err := Load()
	if err == nil {
		t.Fatal("expected error when idle exceeds open")
	}
	if !strings.Contains(err.Error(), "must not exceed") {
		t.Fatalf("error %q should mention 'must not exceed'", err.Error())
	}
}

func TestLoadRejectsNonPositiveVideoLimits(t *testing.T) {
	tests := []struct {
		name string
		key  string
		val  string
	}{
		{name: "zero bytes", key: "MAX_VIDEO_BYTES", val: "0"},
		{name: "negative bytes", key: "MAX_VIDEO_BYTES", val: "-1"},
		{name: "zero per user", key: "MAX_VIDEOS_PER_USER", val: "0"},
		{name: "negative per user", key: "MAX_VIDEOS_PER_USER", val: "-1"},
		{name: "zero per day", key: "MAX_VIDEOS_PER_DAY", val: "0"},
		{name: "negative per day", key: "MAX_VIDEOS_PER_DAY", val: "-1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(tt.key, tt.val)

			_, err := Load()
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tt.key) {
				t.Fatalf("error %q does not name %s", err.Error(), tt.key)
			}
		})
	}
}

func TestLoadAppliesValidOverrides(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("HTTP_PORT", "9090")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("MAX_VIDEO_BYTES", "12345")
	t.Setenv("MAX_VIDEOS_PER_USER", "12")
	t.Setenv("MAX_VIDEOS_PER_DAY", "3")
	t.Setenv("WORKOS_JWKS_URL", "https://example.test/jwks")
	t.Setenv("WORKOS_JWT_ISSUER", "https://example.test/issuer")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Env != "production" || cfg.HTTPPort != "9090" || cfg.LogLevel != "debug" {
		t.Fatalf("unexpected string overrides: %+v", cfg)
	}
	if cfg.MaxVideoBytes != 12345 || cfg.MaxVideosPerUser != 12 || cfg.MaxVideosPerDay != 3 {
		t.Fatalf("unexpected limit overrides: %+v", cfg)
	}
	if cfg.JWKSURL != "https://example.test/jwks" || cfg.JWTIssuer != "https://example.test/issuer" {
		t.Fatalf("unexpected WorkOS URL overrides: %+v", cfg)
	}
}
