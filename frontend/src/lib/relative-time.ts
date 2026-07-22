const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelativeDay(value: Date | null | undefined, now = new Date()): string {
  if (!value) return "Never"

  const elapsed = now.getTime() - value.getTime()
  if (elapsed < 0) return "Scheduled"
  if (elapsed < HOUR) return "Just now"
  if (elapsed < DAY) return "Today"

  const days = Math.floor(elapsed / DAY)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 14) return "Last week"
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`

  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}
