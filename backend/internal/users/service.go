// Package users provides data access for the local user mirror, including
// just-in-time provisioning of a row the first time a WorkOS user is seen.
package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

// Service resolves WorkOS identities to local user rows.
type Service struct {
	db     *gorm.DB
	workos *auth.WorkOSClient
}

func NewService(db *gorm.DB, workos *auth.WorkOSClient) *Service {
	return &Service{db: db, workos: workos}
}

// ResolveOrProvision returns the local user for a verified token. If no local
// row exists yet (first time this user hits the API), it fetches the profile
// from WorkOS and inserts one. The insert is conflict-safe so concurrent first
// requests from the same user cannot create duplicates.
func (s *Service) ResolveOrProvision(ctx context.Context, claims *auth.Claims) (*generated.User, error) {
	workosUserID := claims.Subject

	user, err := s.findByWorkOSID(ctx, workosUserID)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("lookup user: %w", err)
	}

	profile, err := s.workos.GetUser(ctx, workosUserID)
	if err != nil {
		return nil, fmt.Errorf("provision user: %w", err)
	}

	row := &generated.User{WorkosUserID: workosUserID, DisplayName: profile.DisplayName}
	if profile.Email != "" {
		row.Email = &profile.Email
	}
	if err := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "workos_user_id"}}, DoNothing: true}).
		Create(row).Error; err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	// Re-read: OnConflict/DoNothing leaves row.ID unset when another request
	// won the race, so always fetch the canonical row.
	return s.findByWorkOSID(ctx, workosUserID)
}

func (s *Service) FindByID(ctx context.Context, id uuid.UUID) (*generated.User, error) {
	var user generated.User
	if err := s.db.WithContext(ctx).First(&user, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Service) findByWorkOSID(ctx context.Context, workosUserID string) (*generated.User, error) {
	var user generated.User
	if err := s.db.WithContext(ctx).
		Where("workos_user_id = ?", workosUserID).
		First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}
