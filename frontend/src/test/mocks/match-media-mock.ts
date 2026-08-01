export const DEFAULT_TEST_WIDTH = 1024

const MAX_WIDTH = /\(max-width:\s*(\d+)px\)/

function mediaQueryList(query: string): MediaQueryList {
  const max = MAX_WIDTH.exec(query)

  return {
    matches: max ? window.innerWidth <= Number(max[1]) : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList
}

export function installMatchMedia(): void {
  window.matchMedia = ((query: string) => mediaQueryList(query)) as typeof window.matchMedia
}

export function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, writable: true, configurable: true })
}
