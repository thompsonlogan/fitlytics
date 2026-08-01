import "@testing-library/jest-dom/vitest"
import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

import {
  badgeMock,
  buttonMock,
  cardMock,
  checkboxMock,
  dropdownMenuMock,
  inputMock,
  separatorMock,
  tableMock,
  tooltipMock,
} from "./mocks/ui-mocks"
import { lucideReactMock } from "./mocks/lucide-react-mock"
import {
  DEFAULT_TEST_WIDTH,
  installMatchMedia,
  setViewportWidth,
} from "./mocks/match-media-mock"

// Global mocks for the shadcn UI primitives and lucide-react. Rationale and
// per-primitive notes live in ui-mocks.tsx / lucide-react-mock.tsx.
//
// Skeleton is deliberately NOT mocked — it's the lightest primitive in the
// directory (cn + a div), and skeleton.test.tsx asserts on its real classes
// and data attributes, so mocking it would defeat the test.
//
// Card and Table are mocked even though their real impls are thin, because
// their tailwind-class strings + size-variant attributes still take time to
// evaluate on every render; the mock keeps the semantic HTML and `data-slot`
// markers tests care about.
//
// `vi.mock` in setup files registers the mock for every test file that
// imports the named module. A test that needs the real impl can opt out
// with `vi.unmock("@/components/ui/<name>")` at the top of that file
// (or use `vi.importActual` inside a factory).

vi.mock("@/components/ui/badge", () => badgeMock)
vi.mock("@/components/ui/button", () => buttonMock)
vi.mock("@/components/ui/card", () => cardMock)
vi.mock("@/components/ui/checkbox", () => checkboxMock)
vi.mock("@/components/ui/dropdown-menu", () => dropdownMenuMock)
vi.mock("@/components/ui/input", () => inputMock)
vi.mock("@/components/ui/separator", () => separatorMock)
vi.mock("@/components/ui/table", () => tableMock)
vi.mock("@/components/ui/tooltip", () => tooltipMock)

vi.mock("lucide-react", () => lucideReactMock)

// jsdom has no layout engine, so scrollIntoView is unimplemented and throws.
// Components that scroll a thread/list to the bottom call it in an effect;
// stub it to a no-op so those effects don't crash the test render.
Element.prototype.scrollIntoView = vi.fn()

// jsdom has no matchMedia at all; useIsMobile and the theme provider both read
// it during render. See match-media-mock.ts.
installMatchMedia()

// Auto-cleanup the testing-library DOM between tests so leaked nodes from one
// test can't poison the next one's queries, and put the viewport back to
// desktop so a phone-width test can't leak into the next file's expectations.
afterEach(() => {
  cleanup()
  setViewportWidth(DEFAULT_TEST_WIDTH)
})
