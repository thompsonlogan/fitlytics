// Lucide ships ~1.5k named icon exports — each a separate React component.
// In tests we never look at the icon glyphs themselves, so we replace the
// whole module with a Proxy that returns the same lightweight stub for any
// requested name. Far cheaper at import time than the real module and stable
// across icon-name renames.

import * as React from "react"

type IconProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number | string
}

// Single stub used for every icon. Renders a 1x1 <svg> with the icon name as
// a data attribute so tests that wanted to assert "the X icon is here" still
// can, via a selector like `[data-lucide=Plus]`.
function makeIconStub(name: string) {
  return function LucideIconStub({
    className,
    "aria-label": ariaLabel,
    ...props
  }: IconProps) {
    return (
      <svg
        data-lucide={name}
        className={className}
        aria-label={ariaLabel ?? name}
        aria-hidden={ariaLabel ? undefined : true}
        {...props}
      />
    )
  }
}

// Cache stubs by name so consumers that destructure the same icon twice get
// the same component identity — keeps React from treating it as a brand-new
// type on every render.
const iconCache = new Map<string, ReturnType<typeof makeIconStub>>()

const lucideReactMockHandler: ProxyHandler<Record<string, unknown>> = {
  get(_target, prop) {
    if (typeof prop !== "string") return undefined
    // The real module also exports a few non-component names like
    // `createLucideIcon`, `Icon`, `LucideProps`. Returning the stub factory
    // for them is harmless because consumers either render it (works) or
    // ignore it (no error). Add explicit handling here if a future caller
    // needs the real shape.
    let stub = iconCache.get(prop)
    if (!stub) {
      stub = makeIconStub(prop)
      iconCache.set(prop, stub)
    }
    return stub
  },
}

// Exported separately so test_setup can do `vi.mock("lucide-react", () => …)`
// in one line.
export const lucideReactMock = new Proxy({}, lucideReactMockHandler)
