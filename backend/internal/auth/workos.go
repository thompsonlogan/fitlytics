package auth

import (
	"context"
	"fmt"
	"strings"

	"github.com/workos/workos-go/v4/pkg/usermanagement"
)

// Profile is the subset of a WorkOS user record used to provision a local row.
type Profile struct {
	Email       string
	DisplayName string
}

// WorkOSClient wraps the WorkOS User Management API. It is used to fetch a
// user's profile the first time that user is seen, so a local mirror row can
// be created (see users.Service.ResolveOrProvision).
type WorkOSClient struct{}

// NewWorkOSClient configures the WorkOS SDK with the given API key.
func NewWorkOSClient(apiKey string) *WorkOSClient {
	usermanagement.SetAPIKey(apiKey)
	return &WorkOSClient{}
}

// GetUser fetches a single user by WorkOS user id (e.g. "user_01H...").
func (c *WorkOSClient) GetUser(ctx context.Context, workosUserID string) (Profile, error) {
	u, err := usermanagement.GetUser(ctx, usermanagement.GetUserOpts{User: workosUserID})
	if err != nil {
		return Profile{}, fmt.Errorf("workos get user %s: %w", workosUserID, err)
	}

	name := strings.TrimSpace(u.FirstName + " " + u.LastName)
	if name == "" {
		name = u.Email // fall back to email when no name is set
	}
	return Profile{Email: u.Email, DisplayName: name}, nil
}
