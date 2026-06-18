// probeDuration reads a video file's duration via an off-DOM element so the
// client can send it as a hint with the upload (best-effort). Kept in its own
// module so the upload hook can be unit-tested with this stubbed out.
export function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement("video")
    el.preload = "metadata"
    el.onloadedmetadata = () => {
      const d = el.duration
      URL.revokeObjectURL(el.src)
      resolve(Number.isFinite(d) ? d : undefined)
    }
    el.onerror = () => resolve(undefined)
    el.src = URL.createObjectURL(file)
  })
}
