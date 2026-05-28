package programs

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models"
)

// This file holds test-only helpers shared across mapper_test.go,
// service_test.go and handler_test.go: a few fixture builders and the
// hand-written Repository / Service test doubles. Hand-written mocks are
// preferred over mock-generation libraries because the interfaces here are
// tiny and the explicit struct makes the test setup readable.

// ptr returns a pointer to the given value — convenient when building
// pointer-typed model fields in fixtures.
func ptr[T any](v T) *T { return &v }

// strPtr is the same idea, separate name to make table-test cells read more
// naturally.
func strPtr(s string) *string { return &s }

// builtAt is a deterministic timestamp used in fixtures so tests comparing
// JSON output don't churn against time.Now().
var builtAt = time.Date(2026, 5, 23, 17, 30, 0, 0, time.UTC)

// fixedID returns a deterministic UUID derived from a stable string key —
// keeps test fixtures readable without leaking real seed ids into tests.
func fixedID(label string) uuid.UUID {
	// We don't need cryptographic uniqueness; uuid.NewSHA1 with a constant
	// namespace gives stable, reproducible ids per label.
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("fitlytics-test:"+label))
}

// ── Fixture builders ────────────────────────────────────────────────────────

// fullProgram returns a non-trivial program tree exercising every nullable
// field and both compound and isolation set-target shapes. Used by mapper
// and service tests.
func fullProgram() *models.Program {
	squatID := fixedID("ex:squat")
	benchID := fixedID("ex:bench")

	return &models.Program{
		ID:          fixedID("program:1"),
		OwnerUserID: fixedID("user:1"),
		Name:        "Test Program",
		Description: ptr("desc"),
		CreatedAt:   builtAt,
		UpdatedAt:   builtAt,
		Weeks: []models.ProgramWeek{
			{
				ID:        fixedID("week:1"),
				ProgramID: fixedID("program:1"),
				Sequence:  1,
				Name:      strPtr("Week 1"),
				Notes:     strPtr("first week"),
				Days: []models.ProgramDay{
					{
						ID:        fixedID("day:1"),
						WeekID:    fixedID("week:1"),
						Sequence:  1,
						Name:      "Day 1",
						Tag:       strPtr("Day 1"),
						IsRestDay: false,
						Notes:     nil,
						Exercises: []models.ProgramExercise{
							{
								ID:          fixedID("pe:1"),
								DayID:       fixedID("day:1"),
								Sequence:    1,
								ExerciseID:  squatID,
								SubText:     strPtr("Belt"),
								RestSeconds: ptr[int32](180),
								Notes:       nil,
								SetTargets: []models.ProgramSetTarget{
									{
										ID:                     fixedID("pst:1"),
										ProgramExerciseID:      fixedID("pe:1"),
										Sequence:               1,
										SetType:                "working",
										SetsCount:              2,
										RepsMin:                ptr[int32](3),
										RepsMax:                ptr[int32](5),
										IntensityText:          strPtr("285lb"),
										PrescribedLoadKg:       ptr(129.27),
										PrescribedLoadModifier: "absolute",
										CapLoadKg:              ptr(129.27),
										PrescribedRpe:          ptr(5.0),
									},
								},
							},
							{
								// Second exercise re-uses squatID to exercise the
								// dedup branch in collectExerciseIDs.
								ID:         fixedID("pe:2"),
								DayID:      fixedID("day:1"),
								Sequence:   2,
								ExerciseID: squatID,
								SetTargets: []models.ProgramSetTarget{
									{
										ID:                     fixedID("pst:2"),
										ProgramExerciseID:      fixedID("pe:2"),
										Sequence:               1,
										SetType:                "working",
										SetsCount:              1,
										PrescribedLoadModifier: "absolute",
									},
								},
							},
							{
								// Third exercise has no set targets — exercises
								// the empty-children branches in mapExercise.
								ID:         fixedID("pe:3"),
								DayID:      fixedID("day:1"),
								Sequence:   3,
								ExerciseID: benchID,
							},
						},
					},
					{
						// A rest day with no exercises — covers IsRestDay=true.
						ID:        fixedID("day:2"),
						WeekID:    fixedID("week:1"),
						Sequence:  2,
						Name:      "Rest",
						Tag:       strPtr("OFF"),
						IsRestDay: true,
					},
				},
			},
			{
				// Second week with no days — covers the empty Days slice branch.
				ID:        fixedID("week:2"),
				ProgramID: fixedID("program:1"),
				Sequence:  2,
				Name:      strPtr("Week 2 (placeholder)"),
			},
		},
	}
}

// exerciseNames returns the name lookup that pairs with fullProgram(). The
// benchID entry is intentionally omitted so mapper tests can assert the
// "missing name" fallback to "".
func exerciseNames() map[uuid.UUID]string {
	return map[uuid.UUID]string{
		fixedID("ex:squat"): "Competition Squat",
		// fixedID("ex:bench") deliberately absent
	}
}

// ── Test doubles ────────────────────────────────────────────────────────────

// fakeRepository implements Repository with caller-supplied closures. nil
// closures cause the method to return its zero value, which is fine for the
// tests that only exercise one method.
type fakeRepository struct {
	getFullTreeFn        func(ctx context.Context, programID, ownerUserID uuid.UUID) (*models.Program, error)
	listByOwnerFn        func(ctx context.Context, ownerUserID uuid.UUID) ([]models.Program, error)
	lookupExerciseFn     func(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error)
	lastLookupIDs        []uuid.UUID
	lookupCalledCount    int
	getFullTreeCallCount int
	listByOwnerCallCount int
	lastListOwnerID      uuid.UUID
}

func (f *fakeRepository) GetFullTree(ctx context.Context, programID, ownerUserID uuid.UUID) (*models.Program, error) {
	f.getFullTreeCallCount++
	if f.getFullTreeFn == nil {
		return nil, nil
	}
	return f.getFullTreeFn(ctx, programID, ownerUserID)
}

func (f *fakeRepository) ListByOwner(ctx context.Context, ownerUserID uuid.UUID) ([]models.Program, error) {
	f.listByOwnerCallCount++
	f.lastListOwnerID = ownerUserID
	if f.listByOwnerFn == nil {
		return nil, nil
	}
	return f.listByOwnerFn(ctx, ownerUserID)
}

func (f *fakeRepository) LookupExerciseNames(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	f.lookupCalledCount++
	f.lastLookupIDs = ids
	if f.lookupExerciseFn == nil {
		return map[uuid.UUID]string{}, nil
	}
	return f.lookupExerciseFn(ctx, ids)
}

// fakeService implements Service for the handler tests.
type fakeService struct {
	getFullTreeFn func(ctx context.Context, programID, ownerUserID uuid.UUID) (*ProgramResponse, error)
	listByOwnerFn func(ctx context.Context, ownerUserID uuid.UUID) ([]ProgramSummaryResponse, error)
}

func (f *fakeService) GetFullTree(ctx context.Context, programID, ownerUserID uuid.UUID) (*ProgramResponse, error) {
	if f.getFullTreeFn == nil {
		return nil, nil
	}
	return f.getFullTreeFn(ctx, programID, ownerUserID)
}

func (f *fakeService) ListByOwner(ctx context.Context, ownerUserID uuid.UUID) ([]ProgramSummaryResponse, error) {
	if f.listByOwnerFn == nil {
		return []ProgramSummaryResponse{}, nil
	}
	return f.listByOwnerFn(ctx, ownerUserID)
}
