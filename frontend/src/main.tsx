import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"

import "./index.css"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner"
import { router } from "@/router.tsx"
import { ServiceContext } from "@/services/context"
import { createServiceApis } from "@/services/data"

// VITE_API_BASE_URL is optional in dev (empty → Vite proxy routes /api and /auth
// to the Go backend) and required in prod (point at the deployed API origin).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60,
    },
  },
})

const services = {
  apis: createServiceApis({
    basePath: API_BASE_URL,
    // Cookies (session + refresh) carry auth — the typed client must include
    // them on every request. Without this the proxy works but /api/me returns
    // 401 because no cookie is attached.
    credentials: "include",
  }),
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ServiceContext.Provider value={services}>
        <ThemeProvider>
          <RouterProvider router={router} context={{ queryClient, services: services.apis }} />
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </ServiceContext.Provider>
    </QueryClientProvider>
  </StrictMode>
)
