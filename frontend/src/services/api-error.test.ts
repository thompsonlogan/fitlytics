import { describe, expect, it } from "vitest"

import {
  isFieldValidationError,
  isResponseError,
  isResponseErrorWithStatus,
  readApiErrorMessage,
} from "./api-error"
import { ResponseError } from "./generated/runtime"

function makeResponseError(status: number, body?: unknown): ResponseError {
  return new ResponseError(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  )
}

describe("isResponseError", () => {
  it("is true for a ResponseError and false for anything else", () => {
    expect(isResponseError(makeResponseError(400))).toBe(true)
    expect(isResponseError(new TypeError("fetch failed"))).toBe(false)
    expect(isResponseError("nope")).toBe(false)
    expect(isResponseError(undefined)).toBe(false)
  })
})

describe("isResponseErrorWithStatus", () => {
  it("is true only when the status matches exactly", () => {
    expect(isResponseErrorWithStatus(makeResponseError(404), 404)).toBe(true)
    expect(isResponseErrorWithStatus(makeResponseError(401), 401)).toBe(true)
    expect(isResponseErrorWithStatus(makeResponseError(404), 401)).toBe(false)
  })

  it("is false for non-ResponseError values", () => {
    expect(isResponseErrorWithStatus(new TypeError("fetch failed"), 404)).toBe(false)
    expect(isResponseErrorWithStatus(undefined, 404)).toBe(false)
  })
})

describe("isFieldValidationError", () => {
  it("is true for a 4xx that isn't 401/403", () => {
    expect(isFieldValidationError(makeResponseError(400))).toBe(true)
    expect(isFieldValidationError(makeResponseError(422))).toBe(true)
    expect(isFieldValidationError(makeResponseError(404))).toBe(true)
  })

  it("excludes the auth-class 401 and 403", () => {
    expect(isFieldValidationError(makeResponseError(401))).toBe(false)
    expect(isFieldValidationError(makeResponseError(403))).toBe(false)
  })

  it("is false for 5xx and non-ResponseError values", () => {
    expect(isFieldValidationError(makeResponseError(500))).toBe(false)
    expect(isFieldValidationError(new TypeError("fetch failed"))).toBe(false)
  })
})

describe("readApiErrorMessage", () => {
  it("returns the server's error string from an ErrorResponse body", async () => {
    const err = makeResponseError(400, { error: "actual_load_kg out of range" })
    expect(await readApiErrorMessage(err)).toBe("actual_load_kg out of range")
  })

  it("returns undefined for a body without an error field", async () => {
    expect(await readApiErrorMessage(makeResponseError(400, { detail: "x" }))).toBeUndefined()
  })

  it("returns undefined for an unparseable body", async () => {
    expect(await readApiErrorMessage(makeResponseError(400))).toBeUndefined()
  })

  it("returns undefined for a non-ResponseError", async () => {
    expect(await readApiErrorMessage(new TypeError("fetch failed"))).toBeUndefined()
  })
})
