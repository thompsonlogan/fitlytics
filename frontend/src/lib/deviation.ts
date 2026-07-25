export const DEVIATION_FLAG_THRESHOLD = 0.03

export type Deviation = {
  fraction: number
  pct: number
  flagged: boolean
}

export function computeDeviation(
  target: number | null | undefined,
  actual: number | null | undefined
): Deviation | null {
  if (target == null || actual == null || target === 0) return null

  const fraction = (actual - target) / target
  const pct = Math.round(fraction * 100)

  return {
    fraction,
    pct,
    flagged: Math.abs(fraction) > DEVIATION_FLAG_THRESHOLD,
  }
}

export function formatDeviation(pct: number): string {
  if (pct === 0) return "on target"
  return `${pct > 0 ? "+" : ""}${pct}%`
}
