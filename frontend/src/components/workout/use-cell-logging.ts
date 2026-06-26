import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { CYCLE_NEXT, type SetState } from "@/components/workout/set-state"
import { useLogSet, useLogSetBatch } from "@/hooks/use-session"
import { LB_TO_KG } from "@/lib/program-mapper"
import {
  ResponseError,
  type SessionResponse,
  type SetLogResponse,
} from "@/services/generated"

// SET_STATE_DEBOUNCE_MS — how long to wait after the last click before firing
// the PATCH. Lets the user cycle pending → completed → skipped → pending in
// rapid succession without thrashing the API.
const SET_STATE_DEBOUNCE_MS = 500

// CellErrors keys are `${rowKey}:${field}` (e.g. "0-1:load"). Presence of a
// key signals "show the cell error UI"; value is the message.
type CellErrors = Record<string, string>

// readState pulls the canonical set state off a SetLog. The backend column is
// not-null with a default of 'pending', so the only way this is undefined is
// if the API client decodes a missing field — treat that as 'pending'.
function readState(log: SetLogResponse | undefined): SetState {
  const raw = log?.state
  if (raw === "completed" || raw === "skipped") return raw
  return "pending"
}

// Pull the API error message out of the typed fetch client's thrown
// ResponseError. The server returns ErrorResponse {error: string} for 4xx;
// anything else falls through to the generic toast copy.
async function readApiErrorMessage(err: unknown): Promise<string | undefined> {
  if (err instanceof ResponseError) {
    try {
      const body = (await err.response.clone().json()) as { error?: string }
      return body.error
    } catch {
      return undefined
    }
  }
  return undefined
}

function is4xx(err: unknown): err is ResponseError {
  return err instanceof ResponseError && err.response.status >= 400 && err.response.status < 500
}

// buildBlockIndex groups each session exercise's per-set logs back under their
// block row, keyed in the same shape as WorkoutRow.key (`${exIdx}-${blIdx}`,
// 0-based). The sets of one program block ("2 × 5") snapshot a shared `groupId`;
// we group by it, preserving the set order the backend already sorted by. Logs
// without a groupId (ad-hoc sets) each form their own block so they render 1:1.
export function buildBlockIndex(
  session: SessionResponse | null | undefined
): Map<string, SetLogResponse[]> {
  const out = new Map<string, SetLogResponse[]>()
  if (!session?.exercises) return out
  session.exercises.forEach((exercise, exIdx) => {
    const groups = new Map<string, SetLogResponse[]>()
    const order: string[] = [] // distinct block keys in first-seen (== ascending) order
    let synthetic = 0
    for (const log of exercise.setLogs ?? []) {
      // Null groupId → unique synthetic key so each log stands alone.
      const blockKey = log.groupId ?? `__nogroup_${synthetic++}`
      let group = groups.get(blockKey)
      if (!group) {
        group = []
        groups.set(blockKey, group)
        order.push(blockKey)
      }
      group.push(log)
    }
    order.forEach((blockKey, blIdx) => {
      out.set(`${exIdx}-${blIdx}`, groups.get(blockKey)!)
    })
  })
  return out
}

// findBlockLogs re-derives the block grouping from a freshly returned session
// (e.g. right after ensureSession) so writes target the correct set log ids.
// Module-scope (no component state) so it isn't rebuilt on every render.
export function findBlockLogs(rowKey: string, s: SessionResponse | null): SetLogResponse[] {
  return buildBlockIndex(s).get(rowKey) ?? []
}

// readBlockState collapses a block's per-set states into the single tri-state
// the row's check renders: completed only when every set is, skipped only when
// every set is, otherwise pending (covers fresh and mixed blocks).
function readBlockState(logs: SetLogResponse[] | undefined): SetState {
  if (!logs || logs.length === 0) return "pending"
  if (logs.every((l) => readState(l) === "completed")) return "completed"
  if (logs.every((l) => readState(l) === "skipped")) return "skipped"
  return "pending"
}

// KG_PER_LB inverse for display; kept here so we don't pull the program-mapper
// internal into the component file.
const KG_TO_LB_ROUND = (kg: number) => Math.round(kg * 2.20462)

// readActualLoadLb returns the display-ready Load Used value (lb integer) or
// empty string when no actual has been logged yet.
function readActualLoadLb(log: SetLogResponse | undefined): number | "" {
  if (!log || log.actualLoadKg == null) return ""
  return KG_TO_LB_ROUND(log.actualLoadKg)
}

function readActualRpe(log: SetLogResponse | undefined): number | null {
  if (!log || log.actualRpe == null) return null
  return log.actualRpe
}

type UseCellLoggingOpts = {
  blockLogsByKey: Map<string, SetLogResponse[]>
  initialCompleted: Record<string, boolean>
  ensureSession: () => Promise<SessionResponse | null>
  logSet: ReturnType<typeof useLogSet>
  logSetBatch: ReturnType<typeof useLogSetBatch>
}

// useCellLogging owns the workout table's per-cell edit state and the optimistic,
// debounced set-state machine. Extracted from DayBoard verbatim to keep that
// component readable (react-doctor/no-giant-component); behavior is unchanged.
export function useCellLogging({
  blockLogsByKey,
  initialCompleted,
  ensureSession,
  logSet,
  logSetBatch,
}: UseCellLoggingOpts) {
  // Local edit state holds in-flight cell input. We clear after a successful
  // mutation so the cell reads from the cached session again.
  const [loadEdits, setLoadEdits] = useState<Record<string, string>>({})
  const [rpeEdits, setRpeEdits] = useState<Record<string, string>>({})
  const [cellErrors, setCellErrors] = useState<CellErrors>({})
  // Optimistic per-set tri-state. The cell flips instantly on click; the
  // debounced effect below pushes the final state to the API and the cache
  // becomes the source of truth on success.
  const [stateLocal, setStateLocal] = useState<Record<string, SetState>>(() => {
    const seed: Record<string, SetState> = {}
    for (const [key, val] of Object.entries(initialCompleted)) {
      if (val) seed[key] = "completed"
    }
    return seed
  })

  // Per-key debounce timers so multiple rapid clicks on the same cell coalesce
  // into a single PATCH with the final state. Refs (not state) — we don't
  // want a re-render every time a timer reschedules.
  // Lazily create the timer map so we don't allocate a throwaway Map on every
  // render (react-doctor/rerender-lazy-ref-init).
  const timersRef = useRef<Map<string, number> | null>(null)
  const getTimers = () => {
    if (timersRef.current === null) timersRef.current = new Map<string, number>()
    return timersRef.current
  }
  const desiredStateRef = useRef<Record<string, SetState>>({})

  // Merge: session.state is the source of truth; local override wins only
  // while a click sequence is in flight (until the debounced PATCH lands and
  // we drop the override).
  const cellState = useMemo(() => {
    const out: Record<string, SetState> = {}
    for (const [key, logs] of blockLogsByKey) {
      out[key] = readBlockState(logs)
    }
    for (const [key, val] of Object.entries(stateLocal)) {
      out[key] = val
    }
    return out
  }, [blockLogsByKey, stateLocal])

  // SidePanel still uses a boolean "completed" map. Derive it from cellState
  // so the side-panel API doesn't need to change for tri-state — a skipped
  // set doesn't count as completed.
  const completed = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const [key, s] of Object.entries(cellState)) {
      out[key] = s === "completed"
    }
    return out
  }, [cellState])

  const clearEdit = (which: "load" | "rpe", key: string) => {
    const setter = which === "load" ? setLoadEdits : setRpeEdits
    setter((prev) => {
      const { [key]: _, ...rest } = prev
      return rest
    })
  }

  const setErr = (errKey: string, msg: string) =>
    setCellErrors((prev) => ({ ...prev, [errKey]: msg }))
  const clearErr = (errKey: string) =>
    setCellErrors((prev) => {
      const { [errKey]: _, ...rest } = prev
      return rest
    })

  // ─ Editors ─ on-change update local state, on-blur fires the mutation.

  const editLoad = (key: string, value: string) => {
    if (value !== "" && !/^\d{1,4}$/.test(value)) return
    setLoadEdits((prev) => ({ ...prev, [key]: value }))
    if (cellErrors[`${key}:load`]) clearErr(`${key}:load`)
  }
  const editRpe = (key: string, value: string) => {
    if (value === "") {
      setRpeEdits((prev) => ({ ...prev, [key]: "" }))
      if (cellErrors[`${key}:rpe`]) clearErr(`${key}:rpe`)
      return
    }
    if (!/^\d{1,2}$/.test(value)) return
    const n = parseInt(value, 10)
    if (n < 1 || n > 10) return
    setRpeEdits((prev) => ({ ...prev, [key]: value }))
    if (cellErrors[`${key}:rpe`]) clearErr(`${key}:rpe`)
  }

  const blurLoad = async (key: string, value: string) => {
    // Load Used is a block-level value; display reads from the first set.
    const existing = blockLogsByKey.get(key)
    const previousLb = readActualLoadLb(existing?.[0])
    const previousStr = previousLb === "" ? "" : String(previousLb)
    if (value === previousStr || value === "") {
      clearEdit("load", key)
      return
    }
    const lb = parseInt(value, 10)
    if (Number.isNaN(lb)) {
      clearEdit("load", key)
      return
    }

    try {
      const s = await ensureSession()
      const logs = findBlockLogs(key, s)
      if (logs.length === 0) {
        clearEdit("load", key)
        return
      }
      // Fan the load out to every set in the block.
      const actualLoadKg = Number(LB_TO_KG(lb).toFixed(2))
      await logSetBatch.mutateAsync({
        updates: logs.map((log) => ({ setLogId: log.id!, body: { actualLoadKg } })),
      })
      clearEdit("load", key)
    } catch (err) {
      const apiMsg = await readApiErrorMessage(err)
      if (is4xx(err)) {
        setErr(`${key}:load`, apiMsg ?? "Invalid value")
      } else {
        toast.error("Couldn't save load. Check your connection and try again.")
      }
      clearEdit("load", key)
    }
  }

  const blurRpe = async (key: string, value: string) => {
    // "Last Set RPE" reads from / writes to the final set of the block.
    const existing = blockLogsByKey.get(key)
    const previousRpe = readActualRpe(existing?.[existing.length - 1])
    const previousStr = previousRpe == null ? "" : String(previousRpe)
    if (value === previousStr || value === "") {
      clearEdit("rpe", key)
      return
    }
    const rpe = parseInt(value, 10)
    if (Number.isNaN(rpe)) {
      clearEdit("rpe", key)
      return
    }

    try {
      const s = await ensureSession()
      const logs = findBlockLogs(key, s)
      const last = logs[logs.length - 1]
      if (!last) {
        clearEdit("rpe", key)
        return
      }
      await logSet.mutateAsync({
        setLogId: last.id!,
        body: { actualRpe: rpe },
      })
      clearEdit("rpe", key)
    } catch (err) {
      const apiMsg = await readApiErrorMessage(err)
      if (is4xx(err)) {
        setErr(`${key}:rpe`, apiMsg ?? "Invalid value")
      } else {
        toast.error("Couldn't save RPE. Check your connection and try again.")
      }
      clearEdit("rpe", key)
    }
  }

  // cycleSet advances the per-set tri-state on every click and debounces the
  // PATCH so a 1-2-3-click cycle only fires one network call. We track the
  // user's intended final state in a ref so two clicks fired in the same
  // microtask both register — reading the latest from cellState would miss
  // the second click because React hasn't re-rendered yet.
  const cycleSet = (key: string) => {
    const serverState = readBlockState(blockLogsByKey.get(key))
    const current = desiredStateRef.current[key] ?? serverState
    const next = CYCLE_NEXT[current]

    desiredStateRef.current[key] = next
    setStateLocal((prev) => ({ ...prev, [key]: next }))

    const existingTimer = getTimers().get(key)
    if (existingTimer !== undefined) window.clearTimeout(existingTimer)

    const timerId = window.setTimeout(async () => {
      getTimers().delete(key)
      const desired = desiredStateRef.current[key]
      delete desiredStateRef.current[key]
      const serverState = readBlockState(blockLogsByKey.get(key))

      // No-op: user cycled all the way back to the server's state.
      if (desired === serverState) {
        setStateLocal((prev) => {
          const { [key]: _, ...rest } = prev
          return rest
        })
        return
      }

      try {
        const s = await ensureSession()
        const logs = findBlockLogs(key, s)
        if (logs.length === 0) return
        // Completing/skipping a block fans the state out to every set in it.
        await logSetBatch.mutateAsync({
          updates: logs.map((log) => ({ setLogId: log.id!, body: { state: desired } })),
        })
        // onSuccess merged the updated logs into the cache — drop the local
        // override so the merged map pulls from the session again.
        setStateLocal((prev) => {
          const { [key]: _, ...rest } = prev
          return rest
        })
      } catch {
        setStateLocal((prev) => {
          const { [key]: _, ...rest } = prev
          return rest
        })
        toast.error("Couldn't save set state. Check your connection and try again.")
      }
    }, SET_STATE_DEBOUNCE_MS)

    getTimers().set(key, timerId)
  }

  // Persisted actuals get merged with local edits at render time: a local
  // edit takes precedence (user is mid-typing), otherwise display the
  // session-backed value. We do that inside WorkoutTable via the meta.
  const persistedLoad = useMemo(() => {
    const out: Record<string, number | ""> = {}
    for (const [key, logs] of blockLogsByKey) {
      out[key] = readActualLoadLb(logs[0])
    }
    return out
  }, [blockLogsByKey])
  const persistedRpe = useMemo(() => {
    const out: Record<string, number | null> = {}
    for (const [key, logs] of blockLogsByKey) {
      out[key] = readActualRpe(logs[logs.length - 1])
    }
    return out
  }, [blockLogsByKey])

  return {
    cellState,
    completed,
    loadEdits,
    rpeEdits,
    cellErrors,
    persistedLoad,
    persistedRpe,
    editLoad,
    editRpe,
    blurLoad,
    blurRpe,
    cycleSet,
  }
}
