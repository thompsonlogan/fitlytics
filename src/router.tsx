import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router"

import { fetchMe, ME_KEY } from "@/hooks/use-auth"
import { LoginPage } from "@/routes/login"
import { TodayPage } from "@/routes/today"
import type { ServiceApis } from "@/services/data"

// Router context lets beforeLoad guards reach the React Query cache and the
// typed API clients without importing module-scope singletons — keeps the
// data layer swappable and SSR-friendly later if we ever go there.
type RouterContext = {
  queryClient: QueryClient
  services: ServiceApis
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
})

// Hitting "/" sends the user to /today. The /today guard then bounces them to
// /login if they're not signed in — so this is the canonical entry point
// regardless of session state.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/today" })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>): { auth_error?: string } => ({
    auth_error: typeof search.auth_error === "string" ? search.auth_error : undefined,
  }),
  beforeLoad: async ({ context }) => {
    // Signed-in users have no business on /login — push them to the app.
    const me = await context.queryClient.ensureQueryData({
      queryKey: ME_KEY,
      queryFn: () => fetchMe(context.services.authApi),
    })
    if (me) {
      throw redirect({ to: "/today" })
    }
  },
  component: function LoginRoute() {
    const { auth_error } = loginRoute.useSearch()
    return <LoginPage authError={auth_error} />
  },
})

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/today",
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData({
      queryKey: ME_KEY,
      queryFn: () => fetchMe(context.services.authApi),
    })
    if (!me) {
      throw redirect({ to: "/login" })
    }
  },
  component: TodayPage,
})

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, todayRoute])

export const router = createRouter({
  routeTree,
  // queryClient and services are supplied at RouterProvider time; the non-null
  // assertion satisfies the type without forcing every caller to import the
  // real instances.
  context: { queryClient: undefined!, services: undefined! },
  defaultPreload: "intent",
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
