/// <reference types="vitest" />
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
      // Honour a PORT env var when one is provided (e.g. by hosted preview
      // tooling that assigns a port); otherwise Vite uses its default (5173).
      port: process.env.PORT ? Number(process.env.PORT) : undefined,
      // Same-origin proxy so the session cookie set by the Go backend is
      // first-party from the SPA's perspective — no CORS, no SameSite issues.
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/auth": { target: apiTarget, changeOrigin: true },
      },
    },
    test: {
      // jsdom rather than happy-dom because @tanstack/react-router relies on a
      // few DOM APIs that happy-dom misses; testing-library targets jsdom by
      // default. Globals expose describe/it/expect without per-file imports.
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/test_setup.ts"],
      // Generated OpenAPI client is a fixture, not application code — exclude
      // from runs so it doesn't get scanned for stray *.test.ts files.
      exclude: ["node_modules", "dist", "src/services/generated/**"],
      css: false,
      // use-set-videos.ts reads these at module load and they have no in-code
      // fallback by design (see .env.example). frontend/.env is git-ignored, so
      // provide the public, non-secret values here for CI / fresh-checkout test
      // runs. Keep in sync with .env.example.
      env: {
        VITE_MAX_VIDEO_BYTES: "524288000",
        VITE_ALLOWED_VIDEO_TYPES: "video/mp4,video/quicktime,video/webm",
      },
    },
  }
})
