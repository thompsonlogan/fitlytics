import { ResponseError } from "./generated/runtime"

export function isResponseError(err: unknown): err is ResponseError {
  return err instanceof ResponseError
}

export function isResponseErrorWithStatus(err: unknown, status: number): err is ResponseError {
  return isResponseError(err) && err.response.status === status
}

export function isFieldValidationError(err: unknown): err is ResponseError {
  return (
    isResponseError(err) &&
    err.response.status >= 400 &&
    err.response.status < 500 &&
    err.response.status !== 401 &&
    err.response.status !== 403
  )
}

export async function readApiErrorMessage(err: unknown): Promise<string | undefined> {
  if (isResponseError(err)) {
    try {
      const body = (await err.response.clone().json()) as { error?: string }
      return body.error
    } catch {
      return undefined
    }
  }
  return undefined
}
