// Package auth verifies WorkOS access tokens and carries the authenticated
// principal through the request lifecycle.
package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Claims are the WorkOS-specific fields carried in an AuthKit access token,
// alongside the standard registered claims (Subject holds the WorkOS user id).
type Claims struct {
	SessionID      string   `json:"sid"`
	OrganizationID string   `json:"org_id"`
	Role           Role     `json:"role"`
	Permissions    []string `json:"permissions"`
	jwt.RegisteredClaims
}

// HasPermission reports whether the token grants the named permission.
func (c *Claims) HasPermission(name string) bool {
	for _, p := range c.Permissions {
		if p == name {
			return true
		}
	}
	return false
}

// Verifier validates the signature and standard claims of WorkOS access tokens
// against WorkOS's published JWKS. The JWKS is fetched once and refreshed in
// the background for the lifetime of the provided context.
type Verifier struct {
	jwks   keyfunc.Keyfunc
	issuer string
}

// NewVerifier builds a Verifier. issuer may be empty to skip issuer validation
// (signature + expiry are always enforced — those are the security boundary).
func NewVerifier(ctx context.Context, jwksURL, issuer string) (*Verifier, error) {
	jwks, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("load JWKS from %s: %w", jwksURL, err)
	}
	return &Verifier{jwks: jwks, issuer: issuer}, nil
}

// ErrInvalidToken is returned for any token that fails verification.
var ErrInvalidToken = errors.New("invalid or expired token")

// Verify parses and validates a raw bearer token, returning its claims.
func (v *Verifier) Verify(raw string) (*Claims, error) {
	claims := &Claims{}
	opts := []jwt.ParserOption{
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithExpirationRequired(),
	}
	if v.issuer != "" {
		opts = append(opts, jwt.WithIssuer(v.issuer))
	}

	token, err := jwt.ParseWithClaims(raw, claims, v.jwks.Keyfunc, opts...)
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Subject == "" {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
