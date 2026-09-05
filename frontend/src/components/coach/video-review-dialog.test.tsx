import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { VideoReviewDialog } from "@/components/coach/video-review-dialog"
import { ServiceContext } from "@/services/context"
import { MOBILE_MAX_WIDTH } from "@/lib/breakpoints"
import { setViewportWidth } from "@/test/mocks/match-media-mock"
import type { Exercise, SetBlock } from "@/lib/program-data"
import type { SetLogResponse, VideoResponse } from "@/services/generated"
import type { ServiceApis } from "@/services/data"

const BLOCK: SetBlock = {
  id: "block-1",
  sets: 3,
  repsMin: 5,
  repsMax: 5,
  intensity: "80%",
  cap: "",
  rpe: 8,
  prescribedLoad: 200,
}

const EXERCISE: Exercise = { name: "Back Squat", rest: 3, blocks: [BLOCK] }

function logs(n: number): SetLogResponse[] {
  return Array.from({ length: n }, (_, i) => ({ id: `log-${i}` }) as SetLogResponse)
}

function video(overrides: Partial<VideoResponse> = {}): VideoResponse {
  return {
    id: "video-1",
    status: "ready",
    playbackUrl: "https://example.invalid/clip.mp4",
    ...overrides,
  } as VideoResponse
}

function renderDialog(
  videosBySetLogId: Map<string, VideoResponse>,
  blockLogs: SetLogResponse[] = logs(3)
) {
  const videosApi = { apiVideosVideoIdReviewedPost: vi.fn().mockResolvedValue(video()) }
  const coachingApi = {
    apiCoachingLinksLinkIdNotesPost: vi.fn().mockResolvedValue({ id: "note-1" }),
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider
        value={{ apis: { videosApi, coachingApi } as unknown as ServiceApis }}
      >
        <VideoReviewDialog
          open
          onClose={vi.fn()}
          exercise={EXERCISE}
          exNum={1}
          block={BLOCK}
          blockLogs={blockLogs}
          videosBySetLogId={videosBySetLogId}
          sessionId="session-1"
          linkId="link-1"
        />
      </ServiceContext.Provider>
    </QueryClientProvider>
  )

  return { videosApi, coachingApi }
}

describe("VideoReviewDialog", () => {
  it("shows the block's prescription as review context", () => {
    renderDialog(new Map([["log-0", video()]]))

    expect(screen.getByText("Back Squat")).toBeInTheDocument()
    expect(screen.getByText(/3 × 5 at 200 lb · RPE 8/)).toBeInTheDocument()
  })

  it("says so when nothing on the block was filmed", () => {
    renderDialog(new Map())

    expect(screen.getByText(/Nothing filmed on this block yet/i)).toBeInTheDocument()
  })

  it("ignores clips that are not ready", () => {
    renderDialog(new Map([["log-0", video({ status: "uploading" })]]))

    expect(screen.getByText(/Nothing filmed on this block yet/i)).toBeInTheDocument()
  })

  it("marks a clip reviewed", async () => {
    const user = userEvent.setup()
    const { videosApi } = renderDialog(new Map([["log-0", video()]]))

    await user.click(screen.getByRole("button", { name: /mark reviewed/i }))

    expect(videosApi.apiVideosVideoIdReviewedPost).toHaveBeenCalledWith({ videoId: "video-1" })
  })

  it("does not offer to re-review an already reviewed clip", () => {
    renderDialog(new Map([["log-0", video({ reviewedAt: "2026-07-18T00:00:00Z" })]]))

    expect(screen.queryByRole("button", { name: /mark reviewed/i })).not.toBeInTheDocument()
    expect(screen.getByText("Reviewed")).toBeInTheDocument()
  })

  it("attaches the clip to feedback sent from the dialog", async () => {
    const user = userEvent.setup()
    const { coachingApi } = renderDialog(new Map([["log-0", video()]]))

    await user.type(screen.getByRole("textbox", { name: /feedback/i }), "Knees caving.")
    await user.click(screen.getByRole("button", { name: /send feedback/i }))

    expect(coachingApi.apiCoachingLinksLinkIdNotesPost).toHaveBeenCalledWith({
      linkId: "link-1",
      request: { body: "Knees caving.", setVideoId: "video-1" },
    })
  })

  it("will not send empty feedback", () => {
    renderDialog(new Map([["log-0", video()]]))

    expect(screen.getByRole("button", { name: /send feedback/i })).toBeDisabled()
  })

  it("steps between clips when several sets were filmed", async () => {
    const user = userEvent.setup()
    renderDialog(
      new Map([
        ["log-0", video({ id: "video-1" })],
        ["log-2", video({ id: "video-3" })],
      ])
    )

    expect(screen.getByText(/Set 1 · clip 1 of 2/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /next clip/i }))

    expect(screen.getByText(/Set 3 · clip 2 of 2/)).toBeInTheDocument()
  })

  it("shows the athlete's own note alongside the clip", () => {
    renderDialog(new Map([["log-0", video({ note: "Left hip felt off." })]]))

    expect(screen.getByText("Left hip felt off.")).toBeInTheDocument()
  })

  // The corruption case: a draft typed on one clip must not carry to the next,
  // where sending would attach it to the wrong video.
  it("keeps feedback drafts separate per clip", async () => {
    const user = userEvent.setup()
    renderDialog(
      new Map([
        ["log-0", video({ id: "video-1" })],
        ["log-2", video({ id: "video-3" })],
      ])
    )

    const box = () => screen.getByRole("textbox", { name: /feedback/i })
    await user.type(box(), "clip one note")
    await user.click(screen.getByRole("button", { name: /next clip/i }))

    expect(box()).toHaveValue("") // clip two starts blank

    await user.click(screen.getByRole("button", { name: /previous clip/i }))
    expect(box()).toHaveValue("clip one note") // clip one's draft survived
  })

  it("offers a retry when the clip cannot be played", () => {
    renderDialog(new Map([["log-0", video({ playbackUrl: undefined })]]))

    expect(screen.getByText(/couldn't be played/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })

  it("caps the feedback length at the shared note limit", () => {
    renderDialog(new Map([["log-0", video()]]))

    expect(screen.getByRole("textbox", { name: /feedback/i })).toHaveAttribute(
      "maxlength",
      "4000"
    )
  })

  it("pins the review actions outside the scrolling body on a phone", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderDialog(new Map([["log-0", video()]]))

    const sheet = document.querySelector('[data-slot="dialog-content"]')
    const body = document.querySelector('[data-slot="dialog-body"]')
    const send = screen.getByRole("button", { name: /send feedback/i })

    expect(sheet).toHaveAttribute("data-layout", "sheet")
    expect(body).toContainElement(screen.getByRole("textbox", { name: /feedback/i }))
    expect(body!.contains(send)).toBe(false)
  })

  it("keeps every review control reachable when nothing is filmed", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderDialog(new Map())

    expect(screen.getByText(/Nothing filmed on this block yet/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /send feedback/i })).not.toBeInTheDocument()
  })
})
