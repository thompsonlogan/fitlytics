package programs

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func ptr[T any](v T) *T { return &v }

func strPtr(s string) *string { return &s }

var builtAt = time.Date(2026, 5, 23, 17, 30, 0, 0, time.UTC)

func fixedID(label string) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("fitlytics-test:"+label))
}

// ── Fixture builders ────────────────────────────────────────────────────────

func fullProgram() *generated.Program {
	squatID := fixedID("ex:squat")
	benchID := fixedID("ex:bench")

	return &generated.Program{
		ID:          fixedID("program:1"),
		OwnerUserID: fixedID("user:1"),
		Name:        "Test Program",
		Description: ptr("desc"),
		CreatedAt:   builtAt,
		UpdatedAt:   builtAt,
		Weeks: []generated.ProgramWeek{
			{
				ID:        fixedID("week:1"),
				ProgramID: fixedID("program:1"),
				Sequence:  1,
				Name:      strPtr("Week 1"),
				Days: []generated.ProgramDay{
					{
						ID:            fixedID("day:1"),
						ProgramWeekID: fixedID("week:1"),
						Sequence:      1,
						Name:          "Day 1",
						Tag:           strPtr("Day 1"),
						IsRestDay:     false,
						Notes:         nil,
						Exercises: []generated.ProgramExercise{
							{
								ID:           fixedID("pe:1"),
								ProgramDayID: fixedID("day:1"),
								Sequence:     1,
								ExerciseID:   squatID,
								SubText:      strPtr("Belt"),
								RestSeconds:  ptr[int32](180),
								Groups: []generated.ProgramSetGroup{
									{
										ID:                fixedID("psg:1"),
										ProgramExerciseID: fixedID("pe:1"),
										Sequence:          1,
										Sets: []generated.ProgramSet{
											{
												ID:                     fixedID("ps:1"),
												GroupID:                fixedID("psg:1"),
												Sequence:               1,
												SetType:                "working",
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
								},
							},
							{
								// Second exercise re-uses squatID to exercise the
								// dedup branch in collectExerciseIDs.
								ID:           fixedID("pe:2"),
								ProgramDayID: fixedID("day:1"),
								Sequence:     2,
								ExerciseID:   squatID,
								Groups: []generated.ProgramSetGroup{
									{
										ID:                fixedID("psg:2"),
										ProgramExerciseID: fixedID("pe:2"),
										Sequence:          1,
										Sets: []generated.ProgramSet{
											{
												ID:                     fixedID("ps:2"),
												GroupID:                fixedID("psg:2"),
												Sequence:               1,
												SetType:                "working",
												PrescribedLoadModifier: "absolute",
											},
										},
									},
								},
							},
							{
								// Third exercise has no set targets — exercises
								// the empty-children branches in mapExercise.
								ID:           fixedID("pe:3"),
								ProgramDayID: fixedID("day:1"),
								Sequence:     3,
								ExerciseID:   benchID,
							},
						},
					},
					{
						// A rest day with no exercises — covers IsRestDay=true.
						ID:            fixedID("day:2"),
						ProgramWeekID: fixedID("week:1"),
						Sequence:      2,
						Name:          "Rest",
						Tag:           strPtr("OFF"),
						IsRestDay:     true,
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

func exerciseNames() map[uuid.UUID]string {
	return map[uuid.UUID]string{
		fixedID("ex:squat"): "Competition Squat",
		// fixedID("ex:bench") deliberately absent
	}
}

// ── Test doubles ────────────────────────────────────────────────────────────

type fakeRepository struct {
	getProgramOwnerFn        func(ctx context.Context, programID uuid.UUID) (uuid.UUID, error)
	getProgramByIdFn         func(ctx context.Context, programID, ownerUserID uuid.UUID) (*generated.Program, error)
	getProgramsByUserIdFn    func(ctx context.Context, ownerUserID uuid.UUID) ([]generated.Program, error)
	getExercisesByIdsFn      func(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error)
	lastLookupIDs            []uuid.UUID
	getExercisesByIdsCount   int
	getProgramByIdCount      int
	getProgramsByUserIdCount int
	lastListOwnerID          uuid.UUID
}

func (f *fakeRepository) GetProgramOwner(ctx context.Context, programID uuid.UUID) (uuid.UUID, error) {
	if f.getProgramOwnerFn == nil {
		return fixedID("user:1"), nil
	}
	return f.getProgramOwnerFn(ctx, programID)
}

func (f *fakeRepository) GetProgramById(ctx context.Context, programID, ownerUserID uuid.UUID) (*generated.Program, error) {
	f.getProgramByIdCount++
	if f.getProgramByIdFn == nil {
		return nil, nil
	}
	return f.getProgramByIdFn(ctx, programID, ownerUserID)
}

func (f *fakeRepository) GetProgramsByUserId(ctx context.Context, ownerUserID uuid.UUID) ([]generated.Program, error) {
	f.getProgramsByUserIdCount++
	f.lastListOwnerID = ownerUserID
	if f.getProgramsByUserIdFn == nil {
		return nil, nil
	}
	return f.getProgramsByUserIdFn(ctx, ownerUserID)
}

func (f *fakeRepository) GetExercisesByIds(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	f.getExercisesByIdsCount++
	f.lastLookupIDs = ids
	if f.getExercisesByIdsFn == nil {
		return map[uuid.UUID]string{}, nil
	}
	return f.getExercisesByIdsFn(ctx, ids)
}

type fakeService struct {
	getProgramByIdFn      func(ctx context.Context, programID, ownerUserID uuid.UUID) (*ProgramResponse, error)
	getProgramsByUserIdFn func(ctx context.Context, ownerUserID uuid.UUID) ([]ProgramSummaryResponse, error)
}

func (f *fakeService) GetProgramById(ctx context.Context, programID, ownerUserID uuid.UUID) (*ProgramResponse, error) {
	if f.getProgramByIdFn == nil {
		return nil, nil
	}
	return f.getProgramByIdFn(ctx, programID, ownerUserID)
}

func (f *fakeService) GetProgramsByUserId(ctx context.Context, ownerUserID uuid.UUID) ([]ProgramSummaryResponse, error) {
	if f.getProgramsByUserIdFn == nil {
		return []ProgramSummaryResponse{}, nil
	}
	return f.getProgramsByUserIdFn(ctx, ownerUserID)
}
