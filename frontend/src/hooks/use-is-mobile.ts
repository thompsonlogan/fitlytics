import { useSyncExternalStore } from "react"

import { MOBILE_MEDIA_QUERY } from "@/lib/breakpoints"

// subscribe/getSnapshot back a useSyncExternalStore read of matchMedia. We use
// the external-store API (not useState + useEffect) so the value is correct on
// the very first render — no post-mount flash from desktop → mobile — while
// staying compliant with the project's no-useEffect rule.
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

// getServerSnapshot: assume desktop when there's no window (tests/SSR). The
// client snapshot corrects it synchronously on the first real render.
function getServerSnapshot(): boolean {
  return false
}

// useIsMobile returns true while the viewport is phone-width. Drives which
// Today layout renders; both share the same data hooks underneath.
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
