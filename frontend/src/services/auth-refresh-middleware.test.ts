import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAuthRefreshMiddleware,
  resetAuthRefreshState,
} from "./auth-refresh-middleware"
import type { ResponseContext } from "./generated/runtime"

// The middleware is exercised through its `post` hook. Each test stubs the
// global fetch and drives one or more ResponseContexts through the hook,
// asserting on refresh/replay call counts and the returned Response.

const BASE = ""

// callPost invokes the middleware's post hook with a synthetic context whose
// response carries `status`. `init` defaults to a marker object so replay
// assertions can prove the original init was forwarded verbatim.
function callPost(
  post: NonNullable<ReturnType<typeof createAuthRefreshMiddleware>["post"]>,
  status: number,
  url: string,
  init: RequestInit = { method: "PATCH", body: "{}" }
) {
  const ctx: ResponseContext = {
    fetch: vi.fn() as unknown as ResponseContext["fetch"],
    url,
    init,
    response: new Response(null, { status }),
  }
  return post(ctx)
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetAuthRefreshState()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("createAuthRefreshMiddleware", () => {
  it("ignores a non-401 response and never calls fetch", async () => {
    const { post } = createAuthRefreshMiddleware(BASE)

    const result = await callPost(post!, 200, "/api/sessions")

    expect(result).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("ignores a 401 on a non-/api/ URL (loop prevention)", async () => {
    const { post } = createAuthRefreshMiddleware(BASE)

    const result = await callPost(post!, 401, "/auth/refresh")

    expect(result).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refreshes then replays the original request on a 401", async () => {
    const { post } = createAuthRefreshMiddleware(BASE)
    const replayed = new Response(null, { status: 200 })
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // refresh
      .mockResolvedValueOnce(replayed) // replay

    const init: RequestInit = { method: "PATCH", body: '{"x":1}' }
    const result = await callPost(post!, 401, "/api/set-logs/1", init)

    expect(result).toBe(replayed)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/set-logs/1", init)
  })

  it("surfaces the original 401 when refresh fails (no replay)", async () => {
    const { post } = createAuthRefreshMiddleware(BASE)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })) // refresh fails

    const result = await callPost(post!, 401, "/api/sessions")

    expect(result).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1) // refresh only, no replay
  })

  it("single-flights concurrent 401s into one refresh, then replays each", async () => {
    const { post } = createAuthRefreshMiddleware(BASE)

    // Gate the refresh response on a manually-resolved promise so both
    // post-hooks observe refreshInFlight before it settles.
    let releaseRefresh: (r: Response) => void = () => {}
    const refreshGate = new Promise<Response>((resolve) => {
      releaseRefresh = resolve
    })
    fetchMock
      .mockReturnValueOnce(refreshGate) // single refresh
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // replay A
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // replay B

    const pA = callPost(post!, 401, "/api/a")
    const pB = callPost(post!, 401, "/api/b")

    releaseRefresh(new Response(null, { status: 204 }))
    await Promise.all([pA, pB])

    // 1 refresh + 2 replays = 3 fetch calls, with exactly one hitting /auth/refresh.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const refreshCalls = fetchMock.mock.calls.filter(
      ([u]) => u === "/auth/refresh"
    )
    expect(refreshCalls).toHaveLength(1)
  })

  it("returns a still-401 replay as-is without a second refresh", async () => {
    const { post } = createAuthRefreshMiddleware(BASE)
    const stillUnauthorized = new Response(null, { status: 401 })
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 })) // refresh ok
      .mockResolvedValueOnce(stillUnauthorized) // replay still 401

    const result = await callPost(post!, 401, "/api/sessions")

    expect(result).toBe(stillUnauthorized)
    expect(fetchMock).toHaveBeenCalledTimes(2) // one refresh, one replay
    const refreshCalls = fetchMock.mock.calls.filter(
      ([u]) => u === "/auth/refresh"
    )
    expect(refreshCalls).toHaveLength(1)
  })
})
