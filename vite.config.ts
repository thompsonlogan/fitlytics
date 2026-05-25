import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_API_PROXY_TARGET lets the dev proxy point at a non-default backend
  // (e.g. a remote dev server). Falls back to the standard local Go API port.
  const env = loadEnv(mode, process.cwd(), "")
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8080"

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // Same-origin proxy so the session cookie set by the Go backend is
      // first-party from the SPA's perspective — no CORS, no SameSite issues.
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/auth": { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
