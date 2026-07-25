// The app's single phone breakpoint. 767px = just under Tailwind's `md`
// (768px) so CSS (`md:` variants) and JS (useIsMobile) can never disagree
// about "is this a phone". If `md` is ever re-themed, change BOTH together.
export const MOBILE_MAX_WIDTH = 767

// matchMedia query string for the phone viewport. Consumed by useIsMobile;
// import it rather than re-deriving so every JS viewport check shares one
// definition.
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`
