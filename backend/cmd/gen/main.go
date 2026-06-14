// Command gen reverse-engineers GORM models (and a type-safe query API) from
// the live `fitlytics` schema using gorm.io/gen. It is the fitlytics analogue
// of EF Core's `Scaffold-DbContext`.
//
// Navigation fields (the program and session trees) are wired with
// gen.FieldRelate. They are NOT eager-loaded — like EF Core, you opt in per
// query with `db.Preload("Weeks.Days.Exercises")`, the GORM equivalent of
// `.Include()`.
//
// Workflow:
//
//	make db-up           # bring the Flyway-migrated DB online
//	go run ./cmd/gen     # regenerate models in internal/models + query/
package main

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gen"
	"gorm.io/gen/field"
	"gorm.io/gorm"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "gen:", err)
		os.Exit(1)
	}
}

func run() error {
	_ = godotenv.Load()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL is not set")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}

	g := gen.NewGenerator(gen.Config{
		// Query-side (type-safe DAO) code lands here.
		OutPath: "./internal/query",
		// ModelPkgPath is resolved as a sibling of OutPath, so "models/generated"
		// lands at ./internal/models/generated, keeping generated code separate
		// from hand-written types.
		ModelPkgPath: "models/generated",

		// Nullable columns become pointer types.
		FieldNullable: true,
		// Emit the `type:` tag so GORM round-trips enums, numeric precision, etc.
		FieldWithTypeTag: true,
	})

	g.UseDB(db)

	// Type mappings gen can't infer. Keys are the names gorm's postgres
	// driver reports via ColumnType.DatabaseTypeName().
	g.WithDataTypeMap(map[string]func(gorm.ColumnType) string{
		"uuid":    func(gorm.ColumnType) string { return "uuid.UUID" },
		"jsonb":   func(gorm.ColumnType) string { return "models.JSONB" },
		"numeric": func(gorm.ColumnType) string { return "float64" },

		// Array columns -> pq.StringArray. If new array element types appear
		// in the schema, add a key here.
		"text[]":   func(gorm.ColumnType) string { return "pq.StringArray" },
		"muscle[]": func(gorm.ColumnType) string { return "pq.StringArray" },

		// Custom enums collapse to string; the DB enforces the valid value set.
		"movement_pattern": func(gorm.ColumnType) string { return "string" },
		"muscle":           func(gorm.ColumnType) string { return "string" },
		"load_modifier":    func(gorm.ColumnType) string { return "string" },
		"load_type":        func(gorm.ColumnType) string { return "string" },
		"set_type":         func(gorm.ColumnType) string { return "string" },
		"session_state":    func(gorm.ColumnType) string { return "string" },
		"unit_system":      func(gorm.ColumnType) string { return "string" },
	})

	// Imports needed by the data type map. gen merges these into every file
	// that references the symbols above.
	g.WithImportPkgPath(
		"github.com/google/uuid",
		"github.com/lib/pq",
		"github.com/thompsonlogan/fitlytics/backend/internal/models",
	)

	// Helper: gen.FieldType("deleted_at", "gorm.DeletedAt") opts in to GORM
	// soft-delete on the tables that have a deleted_at column.
	softDelete := gen.FieldType("deleted_at", "gorm.DeletedAt")

	// ── Generation order matters ─────────────────────────────────────────────
	// gen.FieldRelate takes the *generated metadata* of the child model, so
	// children must be generated before their parent. Generate bottom-up along
	// each aggregate tree, then pass everything to ApplyBasic.

	// Tables without inbound nav fields can be generated first / independently.
	exercise := g.GenerateModel("exercises", softDelete)
	user := g.GenerateModel("users", softDelete)
	userMetric := g.GenerateModel("user_metrics")

	// ── Session tree: Session → SessionExercise → SetLog ─────────────────────
	setLog := g.GenerateModel("set_logs", softDelete)

	// Set videos hang off a set_log but are queried directly (no nav field), so
	// no gen.FieldRelate is needed — just generate the model + include it below.
	setVideo := g.GenerateModel("set_videos", softDelete)

	sessionExercise := g.GenerateModel("session_exercises",
		// FK convention matches (session_exercise_id -> SessionExerciseID); no override needed.
		gen.FieldRelate(field.HasMany, "SetLogs", setLog, nil),
	)

	session := g.GenerateModel("sessions", softDelete,
		gen.FieldRelate(field.HasMany, "Exercises", sessionExercise, nil),
	)

	// ── Program tree: Program → Week → Day → Exercise → SetTarget ────────────
	programSetTarget := g.GenerateModel("program_set_targets")

	programExercise := g.GenerateModel("program_exercises",
		gen.FieldRelate(field.HasMany, "SetTargets", programSetTarget, nil),
	)

	programDay := g.GenerateModel("program_days",
		// Child FK column is day_id -> DayID, which doesn't match GORM's default
		// convention of ProgramDayID; override explicitly.
		gen.FieldRelate(field.HasMany, "Exercises", programExercise, &field.RelateConfig{
			GORMTag: field.GormTag{"foreignKey": []string{"DayID"}},
		}),
	)

	programWeek := g.GenerateModel("program_weeks",
		// Same story: week_id -> WeekID, not ProgramWeekID.
		gen.FieldRelate(field.HasMany, "Days", programDay, &field.RelateConfig{
			GORMTag: field.GormTag{"foreignKey": []string{"WeekID"}},
		}),
	)

	program := g.GenerateModel("programs", softDelete,
		gen.FieldRelate(field.HasMany, "Weeks", programWeek, nil),
	)

	g.ApplyBasic(
		exercise, user, userMetric,
		setLog, setVideo, sessionExercise, session,
		programSetTarget, programExercise, programDay, programWeek, program,
	)
	g.Execute()
	return nil
}
