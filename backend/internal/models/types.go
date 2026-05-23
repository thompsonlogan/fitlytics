package models

import (
	"database/sql/driver"
	"fmt"
)

// JSONB maps a Postgres jsonb column. It holds raw JSON bytes, so it both
// scans/writes against the database and marshals transparently in API
// responses (the stored object is emitted as-is, not as a base64 string).
type JSONB []byte

func (j JSONB) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

func (j *JSONB) UnmarshalJSON(data []byte) error {
	*j = append((*j)[:0], data...)
	return nil
}

// Value implements driver.Valuer. An empty value is written as an empty JSON
// object so the schema's `not null default '{}'` columns stay satisfied.
func (j JSONB) Value() (driver.Value, error) {
	if len(j) == 0 {
		return "{}", nil
	}
	return string(j), nil
}

// Scan implements sql.Scanner.
func (j *JSONB) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*j = nil
	case []byte:
		*j = append((*j)[:0], v...)
	case string:
		*j = JSONB(v)
	default:
		return fmt.Errorf("JSONB: unsupported scan type %T", src)
	}
	return nil
}

// GormDataType tells GORM the underlying column type.
func (JSONB) GormDataType() string { return "jsonb" }
