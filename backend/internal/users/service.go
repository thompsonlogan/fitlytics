// Package users provides data access for the local user mirror, including
// just-in-time provisioning of a row the first time a WorkOS user is seen.
package users

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	lru "github.com/hashicorp/golang-lru/v2/expirable"
	"golang.org/x/sync/singleflight"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

const (
	defaultCacheSize = 1000
	defaultCacheTTL  = 60 * time.Second
)

// Service resolves WorkOS identities to local user rows.
type Service struct {
	db     *gorm.DB
	workos *auth.WorkOSClient

	// byWorkOSID is an LRU+TTL cache keyed by workos_user_id. Eliminates a
	// DB round-trip on every authenticated request.
	byWorkOSID *lru.LRU[string, *generated.User]

	// byUUID is a parallel cache keyed by the local users.id UUID, used by
	// the dev auth bypass path.
	byUUID *lru.LRU[uuid.UUID, *generated.User]

	// sflight collapses concurrent DB lookups for the same key into a single
	// query (thundering-herd protection).
	sflight singleflight.Group
}

type Option func(*Service)

func WithCacheSize(size int) Option {
	return func(s *Service) {
		s.byWorkOSID = lru.NewLRU[string, *generated.User](size, nil, defaultCacheTTL)
		s.byUUID = lru.NewLRU[uuid.UUID, *generated.User](size, nil, defaultCacheTTL)
	}
}

func WithCacheTTL(ttl time.Duration) Option {
	return func(s *Service) {
		size := s.byWorkOSID.Len()
		if size == 0 {
			size = defaultCacheSize
		}
		s.byWorkOSID = lru.NewLRU[string, *generated.User](size, nil, ttl)
		s.byUUID = lru.NewLRU[uuid.UUID, *generated.User](size, nil, ttl)
	}
}

func NewService(db *gorm.DB, workos *auth.WorkOSClient, opts ...Option) *Service {
	s := &Service{
		db:         db,
		workos:     workos,
		byWorkOSID: lru.NewLRU[string, *generated.User](defaultCacheSize, nil, defaultCacheTTL),
		byUUID:     lru.NewLRU[uuid.UUID, *generated.User](defaultCacheSize, nil, defaultCacheTTL),
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

// ResolveOrProvision returns the local user for a verified token. If no local
// row exists yet (first time this user hits the API), it fetches the profile
// from WorkOS and inserts one. The insert is conflict-safe so concurrent first
// requests from the same user cannot create duplicates.
func (s *Service) ResolveOrProvision(ctx context.Context, claims *auth.Claims) (*generated.User, error) {
	workosUserID := claims.Subject

	if cached, ok := s.byWorkOSID.Get(workosUserID); ok {
		return cached, nil
	}

	// singleflight: if N requests arrive for the same uncached user, only one
	// hits the DB; the rest wait and share the result.
	val, err, _ := s.sflight.Do("workos:"+workosUserID, func() (any, error) {
		return s.resolveOrProvision(ctx, claims)
	})
	if err != nil {
		return nil, err
	}

	user := val.(*generated.User)
	s.cacheUser(user)
	return user, nil
}

func (s *Service) resolveOrProvision(ctx context.Context, claims *auth.Claims) (*generated.User, error) {
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

	return s.findByWorkOSID(ctx, workosUserID)
}

func (s *Service) FindByID(ctx context.Context, id uuid.UUID) (*generated.User, error) {
	if cached, ok := s.byUUID.Get(id); ok {
		return cached, nil
	}

	val, err, _ := s.sflight.Do("uuid:"+id.String(), func() (any, error) {
		var user generated.User
		if err := s.db.WithContext(ctx).First(&user, "id = ?", id).Error; err != nil {
			return nil, err
		}
		return &user, nil
	})
	if err != nil {
		return nil, err
	}

	user := val.(*generated.User)
	s.cacheUser(user)
	return user, nil
}

// cacheUser stores the user in both caches so either lookup path benefits.
func (s *Service) cacheUser(u *generated.User) {
	s.byWorkOSID.Add(u.WorkosUserID, u)
	s.byUUID.Add(u.ID, u)
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
