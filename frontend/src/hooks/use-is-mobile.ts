import { useSyncExternalStore } from "react"

// MOBILE_MAX_WIDTH mirrors the design's phone breakpoint (≤760px). At and below
// this width the Today page swaps its desktop table + top-nav chrome for the
// single-column touch layout with a bottom tab bar. Kept just under Tailwind's
// `md` (768px) so the two never disagree about "is this a phone".
const MOBILE_MAX_WIDTH = 767

const QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`

// subscribe/getSnapshot back a useSyncExternalStore read of matchMedia. We use
// the external-store API (not useState + useEffect) so the value is correct on
// the very first render — no post-mount flash from desktop → mobile — while
// staying compliant with the project's no-useEffect rule.
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
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
