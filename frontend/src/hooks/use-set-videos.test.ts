import { describe, expect, it } from "vitest"

import { ALLOWED_VIDEO_TYPES, isAllowedVideoType, MAX_VIDEO_BYTES } from "./use-set-videos"

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
})
