import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router"

import { NotFoundPage } from "@/components/not-found/not-found-page"
import { fetchMe, ME_KEY } from "@/hooks/use-auth"
import type { ServiceApis } from "@/services/data"

// There's no local login screen — authentication is handled entirely by WorkOS.
// `/auth/login` is a backend endpoint (same origin via the dev proxy / deploy)
// that kicks off the WorkOS AuthKit 302 chain, so we hard-navigate to it.
const WORKOS_LOGIN = "/auth/login"

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

// "/" serves the public marketing landing page to everyone, signed in or not.
// Its CTAs route into the app at /today (whose guard sends unauthenticated
// visitors to the WorkOS login).
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/routes/landing"), "LandingPage"),
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
      // No local login page — hand off to WorkOS. `href` triggers a full-document
      // navigation so the browser follows the backend's 302 chain. WorkOS sends
      // the user back to /today via /auth/callback once authenticated.
      throw redirect({ href: WORKOS_LOGIN })
    }
  },
  component: lazyRouteComponent(() => import("@/routes/today"), "TodayPage"),
})

// Features promised in the nav/marketing but not built yet. Each renders the
// branded 404 so the nav buttons lead somewhere honest; swap the component when
// the real page lands.
const programRoute = createRoute({ getParentRoute: () => rootRoute, path: "/program", component: NotFoundPage })
const historyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/history", component: NotFoundPage })
const analyticsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/analytics", component: NotFoundPage })

const routeTree = rootRoute.addChildren([indexRoute, todayRoute, programRoute, historyRoute, analyticsRoute])

export const router = createRouter({
  routeTree,
  // queryClient and services are supplied at RouterProvider time; the non-null
  // assertion satisfies the type without forcing every caller to import the
  // real instances.
  context: { queryClient: undefined!, services: undefined! },
  defaultPreload: "intent",
  // A route the user navigates to that doesn't exist renders the branded 404
  // view. Data-loading failures are handled inline by the page that owns the
  // data (e.g. /today), so unexpected thrown errors fall back to the router's
  // built-in error component rather than a separate full-screen error page.
  defaultNotFoundComponent: NotFoundPage,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
