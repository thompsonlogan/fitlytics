import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

vi.mock("@/hooks/use-set-videos", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-set-videos")>()
  return {
    ...actual,
    useUploadSetVideo: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteSetVideo: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateVideoNote: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

vi.mock("@/components/workout/video-probe", () => ({
  probeDuration: vi.fn(() => Promise.resolve(12)),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { VideoUploadDialog } from "@/components/workout/video-upload-dialog"
import { MOBILE_MAX_WIDTH } from "@/lib/breakpoints"
import type { Exercise, SetBlock } from "@/lib/program-data"
import type { SetLogResponse, VideoResponse } from "@/services/generated"
import { setViewportWidth } from "@/test/mocks/match-media-mock"

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

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <VideoUploadDialog
        open
        onOpenChange={vi.fn()}
        sessionId="session-1"
        exercise={EXERCISE}
        exNum={1}
        block={BLOCK}
        blockLogs={[{ id: "log-0" }] as SetLogResponse[]}
        videosBySetLogId={new Map<string, VideoResponse>()}
        initialSet={0}
        ensureSetLog={vi.fn()}
      />
    </QueryClientProvider>
  )
}

describe("VideoUploadDialog", () => {
  it("asks for a file on a desktop viewport", () => {
    renderDialog()

    expect(screen.getByText(/Drag & drop your lift video/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Choose file" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument()
  })

  it("leads with the camera on a phone", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderDialog()

    expect(screen.queryByText(/Drag & drop/)).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Record" }).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Choose file" })).not.toBeInTheDocument()
  })

  it("wires a capture input so Record opens the camera, not the file browser", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderDialog()

    const camera = screen.getByLabelText("Record a video for this set")
    expect(camera).toHaveAttribute("capture", "environment")
    expect(camera).toHaveAttribute("accept", "video/*")
  })

  it("renders as a bottom sheet whose footer sits outside the scrolling body", () => {
    setViewportWidth(MOBILE_MAX_WIDTH)
    renderDialog()

    const sheet = document.querySelector('[data-slot="dialog-content"]')
    const body = document.querySelector('[data-slot="dialog-body"]')
    const record = screen.getAllByRole("button", { name: "Record" }).at(-1)!

    expect(sheet).toHaveAttribute("data-layout", "sheet")
    expect(body).toBeInTheDocument()
    expect(body!.contains(record)).toBe(false)
  })

  it("keeps the centred dialog on desktop", () => {
    renderDialog()

    expect(document.querySelector('[data-slot="dialog-content"]')).toHaveAttribute(
      "data-layout",
      "sheet"
    )
    // The sheet layout only reflows below md; the desktop tree still shows the
    // drag-and-drop zone and the inline footer action.
    expect(screen.getByRole("button", { name: "Choose file" })).toBeInTheDocument()
  })
})
