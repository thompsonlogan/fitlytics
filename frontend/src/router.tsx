import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router"

import { CoachLayout } from "@/components/coach/coach-layout"
import { AppLayout } from "@/components/workout/app-layout"
import { NotFoundPage } from "@/components/not-found/not-found-page"
import { fetchMe } from "@/hooks/use-auth"
import { isCoach } from "@/lib/is-coach"
import type { ServiceApis } from "@/services/data"
import { queryKeys } from "@/services/query-keys"

const WORKOS_LOGIN = "/auth/login"

type RouterContext = {
  queryClient: QueryClient
  services: ServiceApis
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/routes/landing"), "LandingPage"),
})

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
})

const todayRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/today",
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData({
      queryKey: queryKeys.me,
      queryFn: () => fetchMe(context.services.authApi),
    })
    if (!me) {
      throw redirect({ href: WORKOS_LOGIN })
    }
  },
  component: lazyRouteComponent(() => import("@/routes/today"), "TodayPage"),
})

const coachLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "coach",
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData({
      queryKey: queryKeys.me,
      queryFn: () => fetchMe(context.services.authApi),
    })
    if (!me) {
      throw redirect({ href: WORKOS_LOGIN })
    }
    if (!isCoach(me)) {
      throw redirect({ to: "/today" })
    }
  },
  component: CoachLayout,
})

const coachRosterRoute = createRoute({
  getParentRoute: () => coachLayoutRoute,
  path: "/coach",
  component: lazyRouteComponent(() => import("@/routes/coach-roster"), "CoachRosterPage"),
})

const coachAthleteRoute = createRoute({
  getParentRoute: () => coachLayoutRoute,
  path: "/coach/athletes/$athleteId",
  component: lazyRouteComponent(() => import("@/routes/coach-athlete"), "CoachAthletePage"),
})

const programRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/program",
  component: NotFoundPage,
})
const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: NotFoundPage,
})
const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analytics",
  component: NotFoundPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  appLayoutRoute.addChildren([todayRoute]),
  coachLayoutRoute.addChildren([coachRosterRoute, coachAthleteRoute]),
  programRoute,
  historyRoute,
  analyticsRoute,
])

export const router = createRouter({
  routeTree,
  context: { queryClient: undefined!, services: undefined! },
  defaultPreload: "intent",
  defaultNotFoundComponent: NotFoundPage,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
