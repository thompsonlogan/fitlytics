package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"testing"
	"time"

	"github.com/MicahParks/jwkset"
	"github.com/golang-jwt/jwt/v5"
)

// fakeKeyfunc is a test-only implementation of keyfunc.Keyfunc that always
// returns the provided RSA public key. Only Keyfunc is ever called by
// Verifier.Verify; the remaining three methods are stubs that satisfy the
// interface.
type fakeKeyfunc struct {
	pub *rsa.PublicKey
}

func (f fakeKeyfunc) Keyfunc(_ *jwt.Token) (any, error) {
	return f.pub, nil
}

func (f fakeKeyfunc) KeyfuncCtx(_ context.Context) jwt.Keyfunc {
	return func(tok *jwt.Token) (any, error) { return f.pub, nil }
}

func (f fakeKeyfunc) Storage() jwkset.Storage {
	return jwkset.NewMemoryStorage()
}

func (f fakeKeyfunc) VerificationKeySet(_ context.Context) (jwt.VerificationKeySet, error) {
	return jwt.VerificationKeySet{}, errors.New("not implemented in fake")
}

// newTestRSAKey generates a 2048-bit RSA key for use in a single test.
func newTestRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("rsa.GenerateKey: %v", err)
	}
	return key
}

// signToken signs a Claims value with the given key using RS256 and returns
// the raw token string.
func signToken(t *testing.T, key *rsa.PrivateKey, claims *Claims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	raw, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}
	return raw
}

func newVerifierWithKey(key *rsa.PrivateKey, issuer string) *Verifier {
	return &Verifier{
		jwks:   fakeKeyfunc{pub: &key.PublicKey},
		issuer: issuer,
	}
}

func TestVerify_ValidToken(t *testing.T) {
	key := newTestRSAKey(t)
	v := newVerifierWithKey(key, "")

	claims := &Claims{}
	claims.Subject = "user_x"
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(time.Hour))

	got, err := v.Verify(signToken(t, key, claims))
	if err != nil {
		t.Fatalf("Verify: unexpected error: %v", err)
	}
	if got.Subject != "user_x" {
		t.Errorf("Subject: got %q, want %q", got.Subject, "user_x")
	}
}

func TestVerify_ExpiredToken(t *testing.T) {
	key := newTestRSAKey(t)
	v := newVerifierWithKey(key, "")

	claims := &Claims{}
	claims.Subject = "user_x"
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Hour))

	_, err := v.Verify(signToken(t, key, claims))
	if err != ErrInvalidToken {
		t.Errorf("expired token: got %v, want ErrInvalidToken", err)
	}
}

func TestVerify_WrongSigningKey(t *testing.T) {
	// Verifier is wired to key1's public key, but the token is signed with key2.
	key1 := newTestRSAKey(t)
	key2 := newTestRSAKey(t)
	v := newVerifierWithKey(key1, "")

	claims := &Claims{}
	claims.Subject = "user_x"
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(time.Hour))

	_, err := v.Verify(signToken(t, key2, claims))
	if err != ErrInvalidToken {
		t.Errorf("wrong signing key: got %v, want ErrInvalidToken", err)
	}
}

func TestVerify_EmptySubject(t *testing.T) {
	key := newTestRSAKey(t)
	v := newVerifierWithKey(key, "")

	claims := &Claims{}
	// Subject intentionally left empty.
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(time.Hour))

	_, err := v.Verify(signToken(t, key, claims))
	if err != ErrInvalidToken {
		t.Errorf("empty subject: got %v, want ErrInvalidToken", err)
	}
}

func TestVerify_NoExpiry(t *testing.T) {
	key := newTestRSAKey(t)
	v := newVerifierWithKey(key, "")

	claims := &Claims{}
	claims.Subject = "user_x"
	// ExpiresAt intentionally not set.

	_, err := v.Verify(signToken(t, key, claims))
	if err != ErrInvalidToken {
		t.Errorf("no expiry: got %v, want ErrInvalidToken", err)
	}
}

func TestVerify_WrongIssuer(t *testing.T) {
	key := newTestRSAKey(t)
	v := newVerifierWithKey(key, "https://expected-issuer.example.com")

	claims := &Claims{}
	claims.Subject = "user_x"
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(time.Hour))
	claims.Issuer = "https://wrong-issuer.example.com"

	_, err := v.Verify(signToken(t, key, claims))
	if err != ErrInvalidToken {
		t.Errorf("wrong issuer: got %v, want ErrInvalidToken", err)
	}
}
