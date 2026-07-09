import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAuthRefreshMiddleware,
  resetAuthRefreshState,
} from "./auth-refresh-middleware"
import type { ResponseContext } from "./generated/runtime"

// The middleware is same-origin in dev/prod (basePath ""), so /api/ URLs are
// relative. Tests use an empty basePath to mirror that.
const BASE = ""

function ctx(url: string, status: number): ResponseContext {
  return {
    fetch: vi.fn() as never,
    url,
    init: { method: "PATCH", body: "{}" },
    response: new Response(null, { status }),
  }
}

// Deferred promise helper so we can gate the refresh mock for the
// single-flight test.
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetAuthRefreshState()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetAuthRefreshState()
})

describe("createAuthRefreshMiddleware", () => {
  it("ignores a non-401 response and never touches fetch", async () => {
    const mw = createAuthRefreshMiddleware(BASE)

    const result = await mw.post!(ctx("/api/sessions/s1", 200))

    expect(result).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("ignores a 401 on a non-/api/ URL (loop prevention)", async () => {
    const mw = createAuthRefreshMiddleware(BASE)

    const result = await mw.post!(ctx("/auth/refresh", 401))

    expect(result).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refreshes once then replays the original request on 401", async () => {
    const replay = new Response(null, { status: 200 })
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // refresh
      .mockResolvedValueOnce(replay) // replay

    const mw = createAuthRefreshMiddleware(BASE)
    const c = ctx("/api/sessions/s1", 401)

    const result = await mw.post!(c)

    expect(result).toBe(replay)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, c.url, c.init)
  })

  it("lets the 401 surface when the refresh itself fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })) // refresh fails

    const mw = createAuthRefreshMiddleware(BASE)

    const result = await mw.post!(ctx("/api/sessions/s1", 401))

    expect(result).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1) // refresh only, no replay
  })

  it("coalesces concurrent 401s into a single refresh (single-flight)", async () => {
    const gate = deferred<Response>()
    fetchMock
      .mockReturnValueOnce(gate.promise) // the one shared refresh, gated
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // replay A
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // replay B

    const mw = createAuthRefreshMiddleware(BASE)

    const p1 = mw.post!(ctx("/api/sessions/a", 401))
    const p2 = mw.post!(ctx("/api/sessions/b", 401))

    // Both are now awaiting the same in-flight refresh; release it.
    gate.resolve(new Response(null, { status: 204 }))
    await Promise.all([p1, p2])

    const refreshCalls = fetchMock.mock.calls.filter(([u]) => u === "/auth/refresh")
    expect(refreshCalls).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3) // 1 refresh + 2 replays
  })

  it("returns a still-401 replay as-is without a second refresh", async () => {
    const stillUnauthorized = new Response(null, { status: 401 })
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // refresh ok
      .mockResolvedValueOnce(stillUnauthorized) // replay still 401

    const mw = createAuthRefreshMiddleware(BASE)

    const result = await mw.post!(ctx("/api/sessions/s1", 401))

    expect(result).toBe(stillUnauthorized)
    const refreshCalls = fetchMock.mock.calls.filter(([u]) => u === "/auth/refresh")
    expect(refreshCalls).toHaveLength(1)
  })
})
