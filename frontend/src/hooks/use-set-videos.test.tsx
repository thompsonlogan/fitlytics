import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

import {
  ALLOWED_VIDEO_TYPES,
  isAllowedVideoType,
  MAX_VIDEO_BYTES,
  useUploadSetVideo,
} from "./use-set-videos"
import { ServiceContext } from "@/services/context"
import type { ServiceApis } from "@/services/data"
import type { VideosApi } from "@/services/generated"
import { queryKeys } from "@/services/query-keys"

describe("use-set-videos client guards", () => {
  it("accepts the allowed video MIME types", () => {
    for (const type of ALLOWED_VIDEO_TYPES) {
      expect(isAllowedVideoType(type)).toBe(true)
    }
  })

  it("rejects non-video / unsupported types", () => {
    expect(isAllowedVideoType("image/gif")).toBe(false)
    expect(isAllowedVideoType("application/pdf")).toBe(false)
    expect(isAllowedVideoType("video/avi")).toBe(false)
    expect(isAllowedVideoType("")).toBe(false)
  })

  it("caps uploads at 500 MB to match the backend default", () => {
    expect(MAX_VIDEO_BYTES).toBe(500 * 1024 * 1024)
  })

  it("isAllowedVideoType uses fallback list when allowed is omitted", () => {
    expect(isAllowedVideoType("video/mp4")).toBe(true)
    expect(isAllowedVideoType("video/avi")).toBe(false)
  })

  it("isAllowedVideoType uses the provided allowed list when given", () => {
    const custom = ["video/avi", "video/mkv"]
    expect(isAllowedVideoType("video/avi", custom)).toBe(true)
    expect(isAllowedVideoType("video/mp4", custom)).toBe(false)
  })
})

describe("useUploadSetVideo", () => {
  it("invalidates the session video list even when the upload fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.spyOn(queryClient, "invalidateQueries")

    // The reserve call returns no upload/video fields, which makes the mutation
    // throw "upload was not reserved" before any XHR happens.
    const fakeVideosApi: Partial<VideosApi> = {
      apiSessionsSessionIdSetLogsSetLogIdVideosPost: () => Promise.resolve({}),
    }

    const services = {
      apis: { videosApi: fakeVideosApi } as unknown as ServiceApis,
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ServiceContext.Provider value={services}>{children}</ServiceContext.Provider>
      </QueryClientProvider>
    )

    const { result } = renderHook(() => useUploadSetVideo(), { wrapper })

    await expect(
      result.current.mutateAsync({
        sessionId: "s1",
        setLogId: "l1",
        file: new File(["x"], "a.mp4", { type: "video/mp4" }),
      })
    ).rejects.toThrow("upload was not reserved")

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.sessionVideos.bySession("s1"),
      })
    })
  })
})
