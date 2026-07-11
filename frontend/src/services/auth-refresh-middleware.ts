import type { Middleware } from "./generated/runtime"

// Single-flight guard: many parallel 401s (React Query fires queries in
// bursts) must produce exactly one POST /auth/refresh. Module-level on
// purpose — all API classes share one middleware instance.
let refreshInFlight: Promise<boolean> | null = null

async function refreshSession(basePath: string): Promise<boolean> {
  const res = await fetch(`${basePath}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
  return res.ok
}

// createAuthRefreshMiddleware returns a `post` middleware for the generated
// client: when an /api/* request comes back 401, refresh the session once
// (single-flight) and replay the original request. Non-/api/ paths (the
// /auth/* endpoints themselves) are ignored to make refresh loops
// structurally impossible. The replay uses the global fetch, NOT the
// middleware-wrapped one passed into the hook, so a still-401 replay cannot
// re-trigger this middleware.
export function createAuthRefreshMiddleware(basePath: string): Middleware {
  return {
    post: async ({ url, init, response }) => {
      if (response.status !== 401) return undefined
      if (!url.startsWith(`${basePath}/api/`)) return undefined

      refreshInFlight ??= refreshSession(basePath).finally(() => {
        refreshInFlight = null
      })
      const refreshed = await refreshInFlight
      if (!refreshed) return undefined // session is dead; let the 401 surface

      return fetch(url, init)
    },
  }
}

// Test-only reset so specs don't share single-flight state.
export function resetAuthRefreshState() {
  refreshInFlight = null
}
