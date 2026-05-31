package programs

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

// Repository is the data-access boundary for the program aggregate. The
// service layer talks to this; tests can swap in a fake without booting
// GORM.
type Repository interface {
	// GetFullTree loads a program plus all its descendants (weeks → days →
	// exercises → set targets), scoped to ownerUserID. Returns
	// gorm.ErrRecordNotFound when the program does not exist or does not
	// belong to the caller — the service maps that to a 404.
	GetFullTree(ctx context.Context, programID, ownerUserID uuid.UUID) (*generated.Program, error)

	// ListByOwner returns the bare program rows owned by the caller, ordered
	// by created_at ASC. No children are preloaded — this powers the program
	// picker, which only needs id + name.
	ListByOwner(ctx context.Context, ownerUserID uuid.UUID) ([]generated.Program, error)

	// LookupExerciseNames returns a {exercise_id: name} map for the given ids.
	// Used by the service to enrich program_exercises with the canonical name
	// in one round-trip instead of N+1 queries.
	LookupExerciseNames(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

type repository struct {
	db *gorm.DB
}

// NewRepository wires the program repository to a live *gorm.DB.
func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db}
}

func (r *repository) GetFullTree(ctx context.Context, programID, ownerUserID uuid.UUID) (*generated.Program, error) {
	var program generated.Program

	// Order children by their sequence column at every level so the client
	// can render the tree without re-sorting.
	err := r.db.WithContext(ctx).
		Preload("Weeks", func(db *gorm.DB) *gorm.DB { return db.Order("sequence ASC") }).
		Preload("Weeks.Days", func(db *gorm.DB) *gorm.DB { return db.Order("sequence ASC") }).
		Preload("Weeks.Days.Exercises", func(db *gorm.DB) *gorm.DB { return db.Order("sequence ASC") }).
		Preload("Weeks.Days.Exercises.SetTargets", func(db *gorm.DB) *gorm.DB { return db.Order("sequence ASC") }).
		Where("id = ? AND owner_user_id = ?", programID, ownerUserID).
		First(&program).Error
	if err != nil {
		return nil, err
	}

	return &program, nil
}

func (r *repository) ListByOwner(ctx context.Context, ownerUserID uuid.UUID) ([]generated.Program, error) {
	var rows []generated.Program
	if err := r.db.WithContext(ctx).
		Where("owner_user_id = ?", ownerUserID).
		Order("created_at ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list programs: %w", err)
	}
	return rows, nil
}

func (r *repository) LookupExerciseNames(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	out := make(map[uuid.UUID]string, len(ids))
	if len(ids) == 0 {
		return out, nil
	}

	// Project only id + name so the network payload stays small.
	type row struct {
		ID   uuid.UUID
		Name string
	}
	var rows []row

	if err := r.db.WithContext(ctx).
		Table(generated.TableNameExercise).
		Select("id, name").
		Where("id IN ?", ids).
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("lookup exercise names: %w", err)
	}

	for _, r := range rows {
		out[r.ID] = r.Name
	}
	return out, nil
}
