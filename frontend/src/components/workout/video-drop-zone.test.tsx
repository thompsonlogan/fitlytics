import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock(
  "lucide-react",
  async () => await vi.importActual<typeof import("lucide-react")>("lucide-react")
)

import { VideoDropZone } from "@/components/workout/video-drop-zone"

function renderZone(isMobile: boolean) {
  const onBrowse = vi.fn()
  const onRecord = vi.fn()
  const view = render(
    <VideoDropZone
      isMobile={isMobile}
      setNumber={2}
      onBrowse={onBrowse}
      onRecord={onRecord}
      dragOver={false}
      setDragOver={vi.fn()}
      onDrop={vi.fn()}
    />
  )
  return { onBrowse, onRecord, ...view }
}

describe("VideoDropZone", () => {
  it("offers drag and drop on a desktop viewport", () => {
    renderZone(false)

    expect(screen.getByText(/Drag & drop your lift video/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument()
  })

  it("browses files when the desktop zone is clicked", async () => {
    const user = userEvent.setup()
    const { onBrowse } = renderZone(false)

    await user.click(screen.getByRole("button"))

    expect(onBrowse).toHaveBeenCalled()
  })

  it("replaces drag and drop with the camera and library on a phone", () => {
    renderZone(true)

    expect(screen.queryByText(/Drag & drop/)).not.toBeInTheDocument()
    expect(screen.getByText("Film set 2")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument()
  })

  it("routes Record to the camera and Library to the file picker", async () => {
    const user = userEvent.setup()
    const { onBrowse, onRecord } = renderZone(true)

    await user.click(screen.getByRole("button", { name: "Record" }))
    expect(onRecord).toHaveBeenCalledTimes(1)
    expect(onBrowse).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Library" }))
    expect(onBrowse).toHaveBeenCalledTimes(1)
  })

  it("states the accepted formats and size cap on both viewports", () => {
    const { unmount } = renderZone(false)
    expect(screen.getByText(/up to/)).toBeInTheDocument()
    unmount()

    renderZone(true)
    expect(screen.getByText(/up to/)).toBeInTheDocument()
  })
})
