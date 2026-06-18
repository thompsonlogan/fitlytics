// Shared, component-free helpers for the set-video dialog. Kept out of the
// component files so those export only components (react-doctor/only-export-components).

// A file the user has picked but not yet uploaded. The object URL drives the
// in-dialog preview and is revoked once the pick is uploaded or discarded.
export type StagedFile = { file: File; url: string; durationSec?: number }

export function fmtBytes(n: number | undefined): string {
  if (n == null) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function fmtTime(s: number | undefined): string {
  if (s == null) return "0:00"
  const r = Math.round(s)
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`
}
