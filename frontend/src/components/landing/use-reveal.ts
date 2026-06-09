import * as React from "react"

// REVEAL is applied to elements that should fade/slide in on scroll. It hides
// the element until `data-revealed="true"` is set by useReveal, and reveals it
// immediately for reduced-motion users. Tailwind-only so it matches the rest of
// the frontend (no stylesheet).
export const REVEAL =
  "translate-y-5 opacity-0 transition-[opacity,transform] duration-[600ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] will-change-[opacity,transform] data-[revealed=true]:translate-y-0 data-[revealed=true]:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none"

// useReveal wires up the scroll-reveal animation across the landing page. It
// watches every `[data-reveal]` element inside the returned container ref and
// sets `data-revealed="true"` as each scrolls into view, then stops observing.
//
// This is a genuine DOM subscription (IntersectionObserver), not derived state,
// so an effect is the right tool. If the observer API is missing or the user
// prefers reduced motion, every element is revealed immediately so content is
// never hidden.
export function useReveal<T extends HTMLElement>() {
  const containerRef = React.useRef<T>(null)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-reveal]"))
    const reveal = (el: HTMLElement) => el.setAttribute("data-revealed", "true")

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach(reveal)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reveal(entry.target as HTMLElement)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    )

    elements.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  return containerRef
}
