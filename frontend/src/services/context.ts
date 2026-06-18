import { createContext, use } from "react"

import type { ServiceApis } from "./data"

interface Services {
  apis: ServiceApis
}

// ServiceContext carries the configured OpenAPI clients to every consumer.
// Initialised to null! so unwrapped useServices() calls outside the provider
// surface as obvious crashes rather than silent type holes.
export const ServiceContext = createContext<Services>(null!)

// useServices returns the typed API bundle. Consumer pattern:
//
//   const { authApi } = useServices()
//   const me = await authApi.apiMeGet()
//
// Never call this outside a component or hook — it depends on the provider
// being mounted in the tree.
export function useServices() {
  return use(ServiceContext).apis
}
