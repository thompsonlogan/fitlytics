package apierr

import "errors"

// Shared sentinel errors for the service layer. Handlers match these with
// errors.Is to map domain failures onto HTTP problem responses; the
// human-readable detail shown to clients is supplied at the call site, so the
// message text here is intentionally generic.
var (
	ErrNotFound     = errors.New("not found")
	ErrInvalidInput = errors.New("invalid input")
)
