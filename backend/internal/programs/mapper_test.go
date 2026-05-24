package programs

import (
	"reflect"
	"testing"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/models"
)

// ─── collectExerciseIDs ─────────────────────────────────────────────────────

func TestCollectExerciseIDs(t *testing.T) {
	t.Run("empty program returns empty slice", func(t *testing.T) {
		got := collectExerciseIDs(&models.Program{})
		if len(got) != 0 {
			t.Fatalf("want empty slice, got %v", got)
		}
	})

	t.Run("dedupes ids that appear in multiple exercises", func(t *testing.T) {
		// fullProgram() intentionally re-uses the squat id across two
		// program_exercises so this branch exercises the seen-map.
		got := collectExerciseIDs(fullProgram())

		expected := map[uuid.UUID]bool{
			fixedID("ex:squat"): true,
			fixedID("ex:bench"): true,
		}

		if len(got) != len(expected) {
			t.Fatalf("expected %d distinct ids, got %d: %v", len(expected), len(got), got)
		}
		for _, id := range got {
			if !expected[id] {
				t.Errorf("unexpected id %s", id)
			}
		}
	})
}

// ─── mapProgram (top-level integration of all mappers) ──────────────────────

func TestMapProgram_StructurePreserved(t *testing.T) {
	program := fullProgram()
	names := exerciseNames()

	resp := mapProgram(program, names)

	// Top-level scalars
	if resp.ID != program.ID {
		t.Errorf("ID: want %v, got %v", program.ID, resp.ID)
	}
	if resp.Name != program.Name {
		t.Errorf("Name: want %q, got %q", program.Name, resp.Name)
	}
	if !reflect.DeepEqual(resp.Description, program.Description) {
		t.Errorf("Description: want %v, got %v", program.Description, resp.Description)
	}
	if !resp.CreatedAt.Equal(program.CreatedAt) {
		t.Errorf("CreatedAt: want %v, got %v", program.CreatedAt, resp.CreatedAt)
	}

	// Tree shape
	if len(resp.Weeks) != len(program.Weeks) {
		t.Fatalf("weeks: want %d, got %d", len(program.Weeks), len(resp.Weeks))
	}

	// Week 1 fully populated → assert recursive shape.
	w1 := resp.Weeks[0]
	if w1.Sequence != 1 {
		t.Errorf("week 1 sequence: want 1, got %d", w1.Sequence)
	}
	if len(w1.Days) != 2 {
		t.Fatalf("week 1 days: want 2, got %d", len(w1.Days))
	}

	// Week 2 has no days → assert empty (not nil) slice so JSON renders [].
	w2 := resp.Weeks[1]
	if w2.Days == nil {
		t.Errorf("week 2 Days should be non-nil empty slice for JSON [] rendering")
	}
	if len(w2.Days) != 0 {
		t.Errorf("week 2 days: want 0, got %d", len(w2.Days))
	}
}

func TestMapProgram_ExerciseNameLookup(t *testing.T) {
	resp := mapProgram(fullProgram(), exerciseNames())

	// Day 1 → exercise 1 should resolve to "Competition Squat" via the map.
	day1 := resp.Weeks[0].Days[0]
	if day1.Exercises[0].ExerciseName != "Competition Squat" {
		t.Errorf("ex[0] name: want %q, got %q", "Competition Squat", day1.Exercises[0].ExerciseName)
	}

	// Day 1 → exercise 3 references benchID, which is intentionally absent
	// from the names map. mapExercise should fall back to "".
	if day1.Exercises[2].ExerciseName != "" {
		t.Errorf("missing-name fallback: want \"\", got %q", day1.Exercises[2].ExerciseName)
	}
}

// ─── mapWeek / mapDay / mapExercise / mapSetTarget (focused branch coverage) ─

func TestMapWeek_NoDays(t *testing.T) {
	w := models.ProgramWeek{ID: fixedID("w"), Sequence: 1, Name: strPtr("W1")}
	out := mapWeek(w, nil)
	if out.ID != w.ID || out.Sequence != 1 || *out.Name != "W1" {
		t.Errorf("scalar copy failed: %+v", out)
	}
	if out.Days == nil || len(out.Days) != 0 {
		t.Errorf("Days should be empty non-nil, got %v", out.Days)
	}
}

func TestMapDay_RestDayWithNoExercises(t *testing.T) {
	d := models.ProgramDay{
		ID:        fixedID("d"),
		Sequence:  2,
		Name:      "Rest",
		Tag:       strPtr("OFF"),
		IsRestDay: true,
	}
	out := mapDay(d, nil)

	if !out.IsRestDay {
		t.Error("IsRestDay should be true")
	}
	if out.Tag == nil || *out.Tag != "OFF" {
		t.Errorf("Tag: %v", out.Tag)
	}
	if out.Exercises == nil || len(out.Exercises) != 0 {
		t.Errorf("Exercises should be empty non-nil, got %v", out.Exercises)
	}
}

func TestMapExercise_AllFieldsAndEmptySetTargets(t *testing.T) {
	exID := fixedID("ex")
	e := models.ProgramExercise{
		ID:          fixedID("pe"),
		Sequence:    1,
		ExerciseID:  exID,
		SubText:     strPtr("Belt"),
		RestSeconds: ptr[int32](90),
		Notes:       strPtr("warm up first"),
		SetTargets:  nil,
	}
	names := map[uuid.UUID]string{exID: "Squat"}
	out := mapExercise(e, names)

	if out.ExerciseName != "Squat" {
		t.Errorf("ExerciseName: want Squat, got %q", out.ExerciseName)
	}
	if out.SubText == nil || *out.SubText != "Belt" {
		t.Errorf("SubText: %v", out.SubText)
	}
	if out.RestSeconds == nil || *out.RestSeconds != 90 {
		t.Errorf("RestSeconds: %v", out.RestSeconds)
	}
	if out.Notes == nil || *out.Notes != "warm up first" {
		t.Errorf("Notes: %v", out.Notes)
	}
	if out.SetTargets == nil || len(out.SetTargets) != 0 {
		t.Errorf("SetTargets should be empty non-nil, got %v", out.SetTargets)
	}
}

func TestMapSetTarget_AllScalarFieldsCopied(t *testing.T) {
	t.Run("populated", func(t *testing.T) {
		in := models.ProgramSetTarget{
			ID:                     fixedID("pst"),
			Sequence:               2,
			SetType:                "amrap",
			SetsCount:              3,
			RepsMin:                ptr[int32](5),
			RepsMax:                ptr[int32](8),
			IntensityText:          strPtr("RPE 8"),
			PrescribedLoadKg:       ptr(100.5),
			PrescribedLoadModifier: "bodyweight_plus",
			CapLoadKg:              ptr(110.0),
			PrescribedRpe:          ptr(8.0),
		}
		got := mapSetTarget(in)

		if got.ID != in.ID || got.Sequence != 2 || got.SetType != "amrap" || got.SetsCount != 3 {
			t.Errorf("scalar fields not copied: %+v", got)
		}
		if *got.RepsMin != 5 || *got.RepsMax != 8 {
			t.Errorf("rep range not copied: min=%v max=%v", got.RepsMin, got.RepsMax)
		}
		if *got.IntensityText != "RPE 8" {
			t.Errorf("intensity text: %v", got.IntensityText)
		}
		if *got.PrescribedLoadKg != 100.5 || got.PrescribedLoadModifier != "bodyweight_plus" {
			t.Errorf("load fields: %+v", got)
		}
		if *got.CapLoadKg != 110.0 || *got.PrescribedRpe != 8.0 {
			t.Errorf("cap/rpe: %+v", got)
		}
	})

	t.Run("all nullable fields nil", func(t *testing.T) {
		in := models.ProgramSetTarget{
			ID:                     fixedID("pst-empty"),
			Sequence:               1,
			SetType:                "working",
			SetsCount:              1,
			PrescribedLoadModifier: "absolute",
		}
		got := mapSetTarget(in)
		if got.RepsMin != nil || got.RepsMax != nil ||
			got.IntensityText != nil || got.PrescribedLoadKg != nil ||
			got.CapLoadKg != nil || got.PrescribedRpe != nil {
			t.Errorf("expected all pointer fields nil, got %+v", got)
		}
	})
}
