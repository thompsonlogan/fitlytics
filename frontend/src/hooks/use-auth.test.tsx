import { describe, expect, it, vi } from "vitest"

import { fetchMe } from "./use-auth"
import { ResponseError } from "@/services/generated/runtime"
import type { AuthApi, MeResponse } from "@/services/generated"

// Build a 401 ResponseError the same way the runtime does: pass a Response-like
// object cast through unknown so we only need the one field fetchMe accesses.
function make401(): ResponseError {
  return new ResponseError({ status: 401 } as unknown as Response, "Unauthorized")
}

function make500(): ResponseError {
  return new ResponseError({ status: 500 } as unknown as Response, "Internal Server Error")
}

function fakeAuthApi(overrides: Partial<{
  apiMeGet: () => Promise<MeResponse>
  authRefreshPost: () => Promise<void>
}>): AuthApi {
  return {
    apiMeGet: overrides.apiMeGet ?? (() => Promise.resolve({})),
    authRefreshPost: overrides.authRefreshPost ?? (() => Promise.resolve()),
  } as unknown as AuthApi
}

describe("fetchMe", () => {
  it("happy path: returns the MeResponse and never calls refresh", async () => {
    const me: MeResponse = { displayName: "Logan" }
    const apiMeGet = vi.fn().mockResolvedValue(me)
    const authRefreshPost = vi.fn()
    const api = fakeAuthApi({ apiMeGet, authRefreshPost })

    const result = await fetchMe(api)

    expect(result).toBe(me)
    expect(authRefreshPost).not.toHaveBeenCalled()
  })

  it("401 → refresh succeeds → retry succeeds: returns the me object", async () => {
    const me: MeResponse = { displayName: "Logan" }
    const apiMeGet = vi
      .fn()
      .mockRejectedValueOnce(make401())
      .mockResolvedValueOnce(me)
    const authRefreshPost = vi.fn().mockResolvedValue(undefined)
    const api = fakeAuthApi({ apiMeGet, authRefreshPost })

    const result = await fetchMe(api)

    expect(authRefreshPost).toHaveBeenCalledOnce()
    expect(apiMeGet).toHaveBeenCalledTimes(2)
    expect(result).toBe(me)
  })

  it("401 → refresh fails: returns null", async () => {
    const apiMeGet = vi.fn().mockRejectedValueOnce(make401())
    const authRefreshPost = vi.fn().mockRejectedValueOnce(new Error("cookie expired"))
    const api = fakeAuthApi({ apiMeGet, authRefreshPost })

    const result = await fetchMe(api)

    expect(result).toBeNull()
  })

  it("401 → refresh ok → retry 401: returns null", async () => {
    const apiMeGet = vi
      .fn()
      .mockRejectedValueOnce(make401())
      .mockRejectedValueOnce(make401())
    const authRefreshPost = vi.fn().mockResolvedValue(undefined)
    const api = fakeAuthApi({ apiMeGet, authRefreshPost })

    const result = await fetchMe(api)

    expect(result).toBeNull()
  })

  it("non-401 ResponseError (500) propagates — does not swallow", async () => {
    const apiMeGet = vi.fn().mockRejectedValueOnce(make500())
    const api = fakeAuthApi({ apiMeGet })

    await expect(fetchMe(api)).rejects.toBeInstanceOf(ResponseError)
  })

  it("plain Error propagates — does not swallow", async () => {
    const apiMeGet = vi.fn().mockRejectedValueOnce(new Error("network failure"))
    const api = fakeAuthApi({ apiMeGet })

    await expect(fetchMe(api)).rejects.toThrow("network failure")
  })
})
