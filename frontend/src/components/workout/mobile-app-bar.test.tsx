import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { routerMock } from "@/test/mocks/router-mock"

vi.mock("@tanstack/react-router", () => routerMock)

import { ThemeProvider } from "@/components/theme-provider"
import { MobileAppBar } from "@/components/workout/mobile-app-bar"
import type { MeResponse } from "@/services/generated"

function renderBar(props: Partial<React.ComponentProps<typeof MobileAppBar>> = {}) {
  const user: MeResponse = { role: "athlete", email: "sam@example.com", ...props.user }
  return render(
    <ThemeProvider>
      <MobileAppBar user={user} onLogout={props.onLogout ?? (() => {})} badge={props.badge} />
    </ThemeProvider>
  )
}

describe("MobileAppBar", () => {
  it("offers a coach entry link to a coach in the athlete view", () => {
    renderBar({ user: { role: "coach" } })

    const link = screen.getByRole("link", { name: "Coach view" })
    expect(link).toHaveAttribute("href", "/coach")
    expect(screen.queryByRole("link", { name: "Exit coach view" })).not.toBeInTheDocument()
  })

  it("hides the coach entry link from a non-coach", () => {
    renderBar({ user: { role: "athlete" } })

    expect(screen.queryByRole("link", { name: "Coach view" })).not.toBeInTheDocument()
  })

  it("offers an exit link back to the athlete view when in coach view", () => {
    renderBar({ user: { role: "coach" }, badge: "Coach" })

    const link = screen.getByRole("link", { name: "Exit coach view" })
    expect(link).toHaveAttribute("href", "/today")
    expect(screen.queryByRole("link", { name: "Coach view" })).not.toBeInTheDocument()
  })
})
