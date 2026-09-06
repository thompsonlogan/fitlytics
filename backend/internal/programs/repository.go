package programs

import (
	"context"
	"database/sql/driver"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
	"github.com/thompsonlogan/fitlytics/backend/internal/query"
	"github.com/thompsonlogan/fitlytics/backend/internal/repoauth"
)

type Repository interface {
	GetProgramOwner(ctx context.Context, programID uuid.UUID) (uuid.UUID, error)
	GetProgramById(ctx context.Context, programID, ownerUserID uuid.UUID) (*generated.Program, error)
	GetProgramsByUserId(ctx context.Context, ownerUserID uuid.UUID) ([]generated.Program, error)
	GetExercisesByIds(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

type repository struct {
	db *gorm.DB
	q  *query.Query
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db, q: query.Use(db)}
}

func (r *repository) GetProgramOwner(ctx context.Context, programID uuid.UUID) (uuid.UUID, error) {
	return repoauth.ProgramOwner(ctx, r.q, programID)
}

func (r *repository) GetProgramById(ctx context.Context, programID, ownerUserID uuid.UUID) (*generated.Program, error) {
	p := r.q.Program

	program, err := p.WithContext(ctx).
		Preload(p.Blocks).
		Preload(p.Weeks).
		Preload(p.Weeks.Days).
		Preload(p.Weeks.Days.Exercises).
		Preload(p.Weeks.Days.Exercises.Groups).
		Preload(p.Weeks.Days.Exercises.Groups.Sets).
		Where(p.ID.Eq(programID), p.OwnerUserID.Eq(ownerUserID)).
		First()
	if err != nil {
		return nil, err
	}

	sortProgramTree(program)
	return program, nil
}

func (r *repository) GetProgramsByUserId(ctx context.Context, ownerUserID uuid.UUID) ([]generated.Program, error) {
	p := r.q.Program

	rows, err := p.WithContext(ctx).
		Where(p.OwnerUserID.Eq(ownerUserID)).
		Order(p.CreatedAt).
		Find()
	if err != nil {
		return nil, fmt.Errorf("list programs: %w", err)
	}

	out := make([]generated.Program, len(rows))
	for i, row := range rows {
		out[i] = *row
	}
	return out, nil
}

func (r *repository) GetExercisesByIds(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	out := make(map[uuid.UUID]string, len(ids))
	if len(ids) == 0 {
		return out, nil
	}

	e := r.q.Exercise

	vals := make([]driver.Valuer, len(ids))
	for i, id := range ids {
		vals[i] = id
	}

	rows, err := e.WithContext(ctx).
		Select(e.ID, e.Name).
		Where(e.ID.In(vals...)).
		Find()
	if err != nil {
		return nil, fmt.Errorf("lookup exercise names: %w", err)
	}

	for _, row := range rows {
		out[row.ID] = row.Name
	}
	return out, nil
}
