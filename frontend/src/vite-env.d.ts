/// <reference types="vite/client" />

// Build-time SPA config. All VITE_* vars are inlined by Vite at build time;
// declaring them here gives import.meta.env.VITE_* precise types instead of
// `any`. Keep in sync with .env.example.
interface ImportMetaEnv {
  readonly VITE_MAX_VIDEO_BYTES: string
  readonly VITE_ALLOWED_VIDEO_TYPES: string
  readonly VITE_API_PROXY_TARGET?: string
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
