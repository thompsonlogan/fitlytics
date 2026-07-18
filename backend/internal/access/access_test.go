package access

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/apierr"
)

type fakeCoaches struct {
	linked      bool
	err         error
	calls       int
	lastCoach   uuid.UUID
	lastAthlete uuid.UUID
}

func (f *fakeCoaches) IsActiveCoach(_ context.Context, coachID, athleteID uuid.UUID) (bool, error) {
	f.calls++
	f.lastCoach, f.lastAthlete = coachID, athleteID
	return f.linked, f.err
}

var (
	owner  = uuid.MustParse("11111111-1111-1111-1111-111111111111")
	coach  = uuid.MustParse("22222222-2222-2222-2222-222222222222")
	outfit = uuid.MustParse("33333333-3333-3333-3333-333333333333")
)

func TestRequireRead_OwnerIsPermittedWithoutALinkLookup(t *testing.T) {
	coaches := &fakeCoaches{}

	if err := NewChecker(coaches).RequireRead(context.Background(), owner, owner); err != nil {
		t.Fatalf("owner should be permitted, got %v", err)
	}
	// Reading your own data must not depend on the coaching table being
	// reachable at all.
	if coaches.calls != 0 {
		t.Error("owner check should short-circuit before the link lookup")
	}
}

func TestRequireRead_LinkedCoachIsPermitted(t *testing.T) {
	coaches := &fakeCoaches{linked: true}

	if err := NewChecker(coaches).RequireRead(context.Background(), coach, owner); err != nil {
		t.Fatalf("linked coach should be permitted, got %v", err)
	}
	if coaches.lastCoach != coach || coaches.lastAthlete != owner {
		t.Errorf("ids must reach the checker unswapped: coach=%v athlete=%v",
			coaches.lastCoach, coaches.lastAthlete)
	}
}

func TestRequireRead_StrangerIsNotFound(t *testing.T) {
	coaches := &fakeCoaches{linked: false}

	err := NewChecker(coaches).RequireRead(context.Background(), outfit, owner)
	if !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("want ErrNotFound so resources cannot be probed, got %v", err)
	}
}

func TestRequireRead_LookupFailureIsNotADenial(t *testing.T) {
	boom := errors.New("connection refused")
	coaches := &fakeCoaches{err: boom}

	err := NewChecker(coaches).RequireRead(context.Background(), coach, owner)
	if !errors.Is(err, boom) {
		t.Errorf("want the underlying error wrapped, got %v", err)
	}
	if errors.Is(err, apierr.ErrNotFound) {
		t.Error("a database failure was reported as 'no access'")
	}
}

func TestRequireWrite_OwnerOnly(t *testing.T) {
	coaches := &fakeCoaches{linked: true}
	c := NewChecker(coaches)

	if err := c.RequireWrite(owner, owner); err != nil {
		t.Errorf("owner should be permitted, got %v", err)
	}

	// The decisive case: a coach with a live link still cannot write.
	if err := c.RequireWrite(coach, owner); !errors.Is(err, apierr.ErrNotFound) {
		t.Errorf("coach must not be able to write, got %v", err)
	}
	if coaches.calls != 0 {
		t.Error("write checks must not consult the coaching link at all")
	}
}
