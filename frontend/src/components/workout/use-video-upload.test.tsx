import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ChangeEvent, ReactNode } from "react"

import { toast } from "sonner"

import { useVideoUpload } from "./use-video-upload"
import { MAX_VIDEO_BYTES, sessionVideosQueryKey } from "@/hooks/use-set-videos"
import type { SetBlock } from "@/lib/program-data"
import type { SetLogResponse, VideoResponse } from "@/services/generated"

// Mocked mutation hooks so the orchestration is unit-tested without the real
// reserve → XHR PUT → finalize network lifecycle.
const { uploadMutateAsync, deleteMutateAsync, updateNoteMutate } = vi.hoisted(() => ({
  uploadMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
  updateNoteMutate: vi.fn(),
}))

vi.mock("@/hooks/use-set-videos", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-set-videos")>()
  return {
    ...actual,
    useUploadSetVideo: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
    useDeleteSetVideo: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
    useUpdateVideoNote: () => ({ mutate: updateNoteMutate, isPending: false }),
  }
})

// jsdom can't decode media, so the off-DOM duration probe is stubbed.
vi.mock("@/components/workout/video-probe", () => ({
  probeDuration: vi.fn(() => Promise.resolve(12)),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

type Opts = Parameters<typeof useVideoUpload>[0]

function makeOpts(overrides: Partial<Opts> = {}): Opts {
  return {
    block: {
      id: "b",
      sets: 2,
      reps: "5",
      intensity: "",
      cap: "",
      rpe: null,
      prescribedLoad: null,
    } as SetBlock,
    blockLogs: [{ id: "log0" }, { id: "log1" }] as unknown as SetLogResponse[],
    videosBySetLogId: new Map<string, VideoResponse>(),
    sessionId: "s1",
    initialSet: 0,
    ensureSetLog: vi.fn().mockResolvedValue({ sessionId: "s1", setLogId: "log0" }),
    onOpenChange: vi.fn(),
    ...overrides,
  }
}

function pickEvent(file: File): ChangeEvent<HTMLInputElement> {
  return { target: { files: [file], value: "" } } as unknown as ChangeEvent<HTMLInputElement>
}

function renderUseVideoUpload(opts: Opts = makeOpts()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return {
    queryClient,
    ...renderHook(() => useVideoUpload(opts), { wrapper }),
  }
}

const mp4 = () => new File(["x"], "lift.mp4", { type: "video/mp4" })

beforeEach(() => {
  vi.clearAllMocks()
  uploadMutateAsync.mockResolvedValue({})
  deleteMutateAsync.mockResolvedValue(undefined)
  URL.createObjectURL = vi.fn(() => "blob:test")
  URL.revokeObjectURL = vi.fn()
})

describe("useVideoUpload — staging", () => {
  it("rejects an unsupported file type without staging", async () => {
    const { result } = renderUseVideoUpload()
    act(() => result.current.onPick(pickEvent(new File(["x"], "a.png", { type: "image/png" }))))
    await waitFor(() => expect(result.current.localError).toBe("Use an MP4, MOV or WebM video."))
    expect(result.current.staged).toBeUndefined()
  })

  it("rejects a file over the size cap", async () => {
    const big = mp4()
    Object.defineProperty(big, "size", { value: MAX_VIDEO_BYTES + 1 })
    const { result } = renderUseVideoUpload()
    act(() => result.current.onPick(pickEvent(big)))
    await waitFor(() => expect(result.current.localError).toMatch(/over the/))
    expect(result.current.staged).toBeUndefined()
  })

  it("stages a valid file with its probed duration", async () => {
    const file = mp4()
    const { result } = renderUseVideoUpload()
    act(() => result.current.onPick(pickEvent(file)))
    await waitFor(() => expect(result.current.staged).toBeDefined())
    expect(result.current.staged?.file).toBe(file)
    expect(result.current.staged?.durationSec).toBe(12)
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
  })
})

describe("useVideoUpload — confirmUpload", () => {
  it("does nothing when no file is staged", async () => {
    const { result } = renderUseVideoUpload()
    await act(async () => {
      await result.current.confirmUpload()
    })
    expect(uploadMutateAsync).not.toHaveBeenCalled()
  })

  it("uploads the staged file to the resolved set log, then clears the preview", async () => {
    const ensureSetLog = vi.fn().mockResolvedValue({ sessionId: "s1", setLogId: "log0" })
    const file = mp4()
    const { result } = renderUseVideoUpload(makeOpts({ ensureSetLog }))

    act(() => result.current.onPick(pickEvent(file)))
    await waitFor(() => expect(result.current.staged).toBeDefined())

    await act(async () => {
      await result.current.confirmUpload()
    })

    expect(ensureSetLog).toHaveBeenCalledWith(0)
    expect(uploadMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s1",
        setLogId: "log0",
        file,
        durationSec: 12,
      })
    )
    await waitFor(() => expect(result.current.staged).toBeUndefined())
  })

  it("surfaces an error and skips upload when the set can't be prepared", async () => {
    const ensureSetLog = vi.fn().mockResolvedValue(undefined)
    const { result } = renderUseVideoUpload(makeOpts({ ensureSetLog }))

    act(() => result.current.onPick(pickEvent(mp4())))
    await waitFor(() => expect(result.current.staged).toBeDefined())

    await act(async () => {
      await result.current.confirmUpload()
    })

    expect(toast.error).toHaveBeenCalled()
    expect(uploadMutateAsync).not.toHaveBeenCalled()
  })
})

describe("useVideoUpload — existing video", () => {
  const withReadyVideo = (overrides: Partial<Opts> = {}) =>
    makeOpts({
      videosBySetLogId: new Map<string, VideoResponse>([
        [
          "log0",
          {
            id: "v0",
            status: "ready",
            note: "",
            playbackUrl: "https://r2/old",
          } as VideoResponse,
        ],
      ]),
      ...overrides,
    })

  it("exposes the current set's ready video", () => {
    const { result } = renderUseVideoUpload(withReadyVideo())
    expect(result.current.isReady).toBe(true)
    expect(result.current.currentVideo?.id).toBe("v0")
    expect(result.current.filmedCount).toBe(1)
  })

  it("deletes the current set's video on remove", async () => {
    const { result } = renderUseVideoUpload(withReadyVideo())
    await act(async () => {
      await result.current.handleRemove()
    })
    expect(deleteMutateAsync).toHaveBeenCalledWith({ sessionId: "s1", videoId: "v0" })
  })

  it("refreshes the session videos silently on the first saved-playback error", () => {
    const { result, queryClient } = renderUseVideoUpload(withReadyVideo())
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    act(() => result.current.handlePlaybackError("https://r2/old"))

    expect(invalidate).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionVideosQueryKey("s1") })
    expect(result.current.erroredSrc).toBeNull()
  })

  it("shows the format warning on a second saved-playback error for the same video", () => {
    const { result, queryClient } = renderUseVideoUpload(withReadyVideo())
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    act(() => result.current.handlePlaybackError("https://r2/old"))
    act(() => result.current.handlePlaybackError("https://r2/old"))

    expect(invalidate).toHaveBeenCalledOnce()
    expect(result.current.erroredSrc).toBe("https://r2/old")
  })

  it("shows the format warning immediately when playback cannot refresh without a session", () => {
    const { result, queryClient } = renderUseVideoUpload(
      withReadyVideo({ sessionId: undefined })
    )
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    act(() => result.current.handlePlaybackError("https://r2/old"))

    expect(invalidate).not.toHaveBeenCalled()
    expect(result.current.erroredSrc).toBe("https://r2/old")
  })

  it("saves a changed note but skips an unchanged one", async () => {
    const { result } = renderUseVideoUpload(withReadyVideo())

    act(() => result.current.setNoteDraft("felt heavy"))
    await waitFor(() => expect(result.current.noteValue).toBe("felt heavy"))
    act(() => result.current.commitNote())
    expect(updateNoteMutate).toHaveBeenCalledWith({
      sessionId: "s1",
      videoId: "v0",
      note: "felt heavy",
    })

    updateNoteMutate.mockClear()
    act(() => result.current.setNoteDraft(""))
    await waitFor(() => expect(result.current.noteValue).toBe(""))
    act(() => result.current.commitNote())
    expect(updateNoteMutate).not.toHaveBeenCalled()
  })
})

describe("useVideoUpload — close", () => {
  it("drops staged files and notifies the parent on close", async () => {
    const onOpenChange = vi.fn()
    const { result } = renderUseVideoUpload(makeOpts({ onOpenChange }))

    act(() => result.current.onPick(pickEvent(mp4())))
    await waitFor(() => expect(result.current.staged).toBeDefined())

    act(() => result.current.handleOpenChange(false))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(result.current.staged).toBeUndefined())
  })
})
