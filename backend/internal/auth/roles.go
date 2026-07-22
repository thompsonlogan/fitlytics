package auth

type Role string

const (
	RoleCoach Role = "Coach"
)

func (c *Claims) HasRole(role Role) bool {
	return c != nil && c.Role == role
}
