// SetState mirrors the backend set_log_state enum. "pending" is the default
// after a session is created; the user cycles into "completed" or "skipped"
// by clicking the cell.
export type SetState = "pending" | "completed" | "skipped"

export const CYCLE_NEXT: Record<SetState, SetState> = {
  pending: "completed",
  completed: "skipped",
  skipped: "pending",
}
