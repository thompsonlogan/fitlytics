import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useServices } from "@/services/context"
import type { AuthApi, MeResponse } from "@/services/generated"
import { ResponseError } from "@/services/generated/runtime"

// ME_KEY is exported so route guards (beforeLoad in the router) can read the
// cached value via queryClient.ensureQueryData without re-declaring the key.
export const ME_KEY = ["me"] as const

// fetchMe resolves the current session through the typed Auth API. A 401
// triggers one silent refresh; if the refresh also fails we return null so
// the route guard can hand off to the WorkOS login. Any other error bubbles so
// React Query can surface it.
export async function fetchMe(authApi: AuthApi): Promise<MeResponse | null> {
  try {
    return await authApi.apiMeGet()
  } catch (err) {
    if (!(err instanceof ResponseError) || err.response.status !== 401) {
      throw err
    }
    try {
      await authApi.authRefreshPost()
    } catch {
      return null
    }
    try {
      return await authApi.apiMeGet()
    } catch (retryErr) {
      if (retryErr instanceof ResponseError && retryErr.response.status === 401) {
        return null
      }
      throw retryErr
    }
  }
}

export function useAuth() {
  const queryClient = useQueryClient()
  const { authApi } = useServices()

  const { data, isLoading, error } = useQuery({
    queryKey: ME_KEY,
    queryFn: () => fetchMe(authApi),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  return {
    user: data ?? null,
    isLoading,
    isAuthenticated: !!data,
    error,

    // signIn is a full-page navigation, not a fetch, because the WorkOS
    // authorize URL is a 302 chain that the browser must follow itself.
    signIn: () => {
      window.location.href = "/auth/login"
    },

    signOut: async () => {
      try {
        await authApi.authLogoutPost()
      } finally {
        queryClient.setQueryData(ME_KEY, null)
        // Full-page navigation rather than router.navigate so any React state
        // tied to the previous session is reset cleanly. Lands on the public
        // landing page ("/").
        window.location.href = "/"
      }
    },
  }
}
