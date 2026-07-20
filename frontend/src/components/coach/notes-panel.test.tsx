import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { NotesPanel } from "@/components/coach/notes-panel"
import { ServiceContext } from "@/services/context"
import type { CoachNoteResponse } from "@/services/generated"
import type { ServiceApis } from "@/services/data"

const COACH = "coach-1"
const ATHLETE = "athlete-1"

function note(overrides: Partial<CoachNoteResponse> = {}): CoachNoteResponse {
  return {
    id: `note-${Math.random()}`,
    authorUserId: ATHLETE,
    authorName: "Marcus Webb",
    body: "Felt heavy today.",
    createdAt: "2026-07-18T10:00:00Z",
    ...overrides,
  }
}

function renderPanel(notes: CoachNoteResponse[], linkId: string | undefined) {
  const coachingApi = {
    apiCoachingLinksLinkIdNotesGet: vi.fn().mockResolvedValue(notes),
    apiCoachingLinksLinkIdNotesPost: vi.fn().mockResolvedValue(note()),
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider value={{ apis: { coachingApi } as unknown as ServiceApis }}>
        <NotesPanel linkId={linkId} currentUserId={COACH} />
      </ServiceContext.Provider>
    </QueryClientProvider>
  )

  return { coachingApi }
}

describe("NotesPanel", () => {
  it("shows the thread", async () => {
    renderPanel([note(), note({ authorUserId: COACH, body: "Drop to 90% next week." })], "link-1")

    expect(await screen.findByText("Felt heavy today.")).toBeInTheDocument()
    expect(screen.getByText("Drop to 90% next week.")).toBeInTheDocument()
  })

  it("explains that notes are visible to the athlete when empty", async () => {
    renderPanel([], "link-1")

    expect(await screen.findByText(/visible to the athlete/i)).toBeInTheDocument()
  })

  it("posts a note and clears the composer", async () => {
    const user = userEvent.setup()
    const { coachingApi } = renderPanel([], "link-1")

    await screen.findByText(/visible to the athlete/i)
    const box = screen.getByRole("textbox", { name: /write a note/i })
    await user.type(box, "Nice bar path.")
    await user.click(screen.getByRole("button", { name: /post note/i }))

    expect(coachingApi.apiCoachingLinksLinkIdNotesPost).toHaveBeenCalledWith({
      linkId: "link-1",
      request: { body: "Nice bar path.", setVideoId: undefined },
    })
    expect(box).toHaveValue("")
  })

  it("sends on Enter but not on Shift+Enter", async () => {
    const user = userEvent.setup()
    const { coachingApi } = renderPanel([], "link-1")

    await screen.findByText(/visible to the athlete/i)
    const box = screen.getByRole("textbox", { name: /write a note/i })

    await user.type(box, "line one{Shift>}{Enter}{/Shift}")
    expect(coachingApi.apiCoachingLinksLinkIdNotesPost).not.toHaveBeenCalled()

    await user.type(box, "{Enter}")
    expect(coachingApi.apiCoachingLinksLinkIdNotesPost).toHaveBeenCalledTimes(1)
  })

  it("refuses to post whitespace", async () => {
    const user = userEvent.setup()
    const { coachingApi } = renderPanel([], "link-1")

    await screen.findByText(/visible to the athlete/i)
    await user.type(screen.getByRole("textbox", { name: /write a note/i }), "   ")

    expect(screen.getByRole("button", { name: /post note/i })).toBeDisabled()
    expect(coachingApi.apiCoachingLinksLinkIdNotesPost).not.toHaveBeenCalled()
  })

  it("does not fetch a thread when there is no link", () => {
    const { coachingApi } = renderPanel([], undefined)

    expect(coachingApi.apiCoachingLinksLinkIdNotesGet).not.toHaveBeenCalled()
  })
})
