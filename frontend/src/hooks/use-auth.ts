import { useQuery, useQueryClient } from "@tanstack/react-query"

import { isResponseErrorWithStatus } from "@/services/api-error"
import { useServices } from "@/services/context"
import type { AuthApi, MeResponse } from "@/services/generated"
import { queryKeys } from "@/services/query-keys"

// fetchMe resolves the current session through the typed Auth API. A 401
// triggers one silent refresh; if the refresh also fails we return null so
// the route guard can hand off to the WorkOS login. Any other error bubbles so
// React Query can surface it.
export async function fetchMe(authApi: AuthApi): Promise<MeResponse | null> {
  try {
    return await authApi.apiMeGet()
  } catch (err) {
    if (!isResponseErrorWithStatus(err, 401)) {
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
      if (isResponseErrorWithStatus(retryErr, 401)) {
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
    queryKey: queryKeys.me,
    queryFn: () => fetchMe(authApi),
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
        queryClient.setQueryData(queryKeys.me, null)
        // Full-page navigation rather than router.navigate so any React state
        // tied to the previous session is reset cleanly. Lands on the public
        // landing page ("/").
        window.location.href = "/"
      }
    },
  }
}
