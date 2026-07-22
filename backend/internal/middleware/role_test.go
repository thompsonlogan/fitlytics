package middleware

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/thompsonlogan/fitlytics/backend/internal/auth"
	"github.com/thompsonlogan/fitlytics/backend/internal/models/generated"
)

func newRoleEngine(required auth.Role, claims *auth.Claims) (*gin.Engine, *bool) {
	gin.SetMode(gin.TestMode)

	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	reached := false
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if claims != nil {
			auth.SetPrincipal(c, &auth.Principal{User: &generated.User{}, Claims: claims})
		}
		c.Next()
	})
	r.GET("/probe", RequireRole(required, log), func(c *gin.Context) {
		reached = true
		c.Status(http.StatusOK)
	})
	return r, &reached
}

func TestRequireRole_AllowsMatchingRole(t *testing.T) {
	r, reached := newRoleEngine(auth.RoleCoach, &auth.Claims{Role: auth.RoleCoach})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/probe", nil))

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
	if !*reached {
		t.Error("handler should have run")
	}
}

func TestRequireRole_RejectsOtherRoles(t *testing.T) {
	for _, role := range []auth.Role{"", "Athlete", "admin", "coach", "COACH", "Coach "} {
		t.Run("role="+string(role), func(t *testing.T) {
			r, reached := newRoleEngine(auth.RoleCoach, &auth.Claims{Role: role})

			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/probe", nil))

			if w.Code != http.StatusForbidden {
				t.Errorf("want 403, got %d", w.Code)
			}
			if *reached {
				t.Error("handler must not run without the required role")
			}
		})
	}
}

func TestRequireRole_PermissionAloneIsNotEnough(t *testing.T) {
	r, reached := newRoleEngine(auth.RoleCoach, &auth.Claims{Permissions: []string{"Coach", "coach:access"}})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/probe", nil))

	if w.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", w.Code)
	}
	if *reached {
		t.Error("handler must not run")
	}
}

func TestRequireRole_NoPrincipalIsRejected(t *testing.T) {
	r, reached := newRoleEngine(auth.RoleCoach, nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/probe", nil))

	if w.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", w.Code)
	}
	if *reached {
		t.Error("handler must not run without a principal")
	}
}

func TestRequireRole_DoesNotDiscloseTheRequiredRole(t *testing.T) {
	r, _ := newRoleEngine(auth.RoleCoach, &auth.Claims{Role: "Athlete"})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/probe", nil))

	body := w.Body.String()
	for _, leak := range []string{"Coach", "coach", "Athlete", "athlete", "role"} {
		if strings.Contains(body, leak) {
			t.Errorf("403 body leaks authorization detail %q: %s", leak, body)
		}
	}
}

func TestRequireRole_IsGenericOverTheRole(t *testing.T) {
	const other auth.Role = "Nutritionist"

	r, reached := newRoleEngine(other, &auth.Claims{Role: other})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/probe", nil))

	if w.Code != http.StatusOK {
		t.Errorf("want 200 for a matching non-coach role, got %d", w.Code)
	}
	if !*reached {
		t.Error("handler should have run")
	}

	r2, reached2 := newRoleEngine(other, &auth.Claims{Role: auth.RoleCoach})

	w2 := httptest.NewRecorder()
	r2.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/probe", nil))

	if w2.Code != http.StatusForbidden {
		t.Errorf("want 403 when the role does not match, got %d", w2.Code)
	}
	if *reached2 {
		t.Error("handler must not run")
	}
}
