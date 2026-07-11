import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { toast } from "sonner"

import { buildBlockIndex, useCellLogging } from "./use-cell-logging"
import { useLogSet, useLogSetBatch } from "@/hooks/use-session"
import { ResponseError } from "@/services/generated"
import type {
  SessionExerciseResponse,
  SessionResponse,
  SetLogResponse,
} from "@/services/generated"

// The hook toasts on network-class failures; mock sonner so we can assert on it.
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeSetLog(
  id: string,
  opts: {
    state?: string
    groupId?: string
    actualLoadKg?: number
    actualRpe?: number
  } = {}
): SetLogResponse {
  return {
    id,
    state: opts.state,
    groupId: opts.groupId,
    actualLoadKg: opts.actualLoadKg,
    actualRpe: opts.actualRpe,
  }
}

function makeExercise(setLogs: SetLogResponse[], id = "ex-1"): SessionExerciseResponse {
  return { id, setLogs }
}

function makeSession(id: string, exercises: SessionExerciseResponse[]): SessionResponse {
  return { id, exercises }
}

// Build a ResponseError with a real Response body so readApiErrorMessage can
// parse it, mirroring what the typed fetch client throws for non-2xx codes.
function makeResponseError(status: number, body?: unknown): ResponseError {
  return new ResponseError(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  )
}

// makeHook wires useCellLogging with fake mutations and an ensureSession stub
// resolving to the same session buildBlockIndex was derived from. The returned
// mocks let tests assert on the network calls the hook fires.
function makeHook(
  session: SessionResponse | null,
  overrides: {
    logSetBatch?: ReturnType<typeof vi.fn>
    logSet?: ReturnType<typeof vi.fn>
    ensureSession?: ReturnType<typeof vi.fn>
    initialCompleted?: Record<string, boolean>
  } = {}
) {
  const blockLogsByKey = buildBlockIndex(session)
  const logSetBatchMock = overrides.logSetBatch ?? vi.fn().mockResolvedValue([])
  const logSetMock = overrides.logSet ?? vi.fn().mockResolvedValue({})
  const ensureSessionMock = overrides.ensureSession ?? vi.fn().mockResolvedValue(session)
  const logSetBatch = { mutateAsync: logSetBatchMock } as unknown as ReturnType<
    typeof useLogSetBatch
  >
  const logSet = { mutateAsync: logSetMock } as unknown as ReturnType<typeof useLogSet>

  const rendered = renderHook(() =>
    useCellLogging({
      blockLogsByKey,
      initialCompleted: overrides.initialCompleted ?? {},
      ensureSession: ensureSessionMock as unknown as () => Promise<SessionResponse | null>,
      logSet,
      logSetBatch,
    })
  )
  return { ...rendered, logSetBatchMock, logSetMock, ensureSessionMock }
}

afterEach(() => {
  vi.clearAllMocks()
})

// ─── buildBlockIndex ────────────────────────────────────────────────────────

describe("buildBlockIndex", () => {
  it("groups logs sharing a groupId under one key, in input order", () => {
    const session = makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1" }),
        makeSetLog("b", { groupId: "g1" }),
      ]),
    ])

    const idx = buildBlockIndex(session)

    expect(idx.size).toBe(1)
    expect(idx.get("0-0")?.map((l) => l.id)).toEqual(["a", "b"])
  })

  it("keys two distinct groupIds as 0-0 and 0-1 in first-seen order", () => {
    const session = makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1" }),
        makeSetLog("b", { groupId: "g2" }),
        makeSetLog("c", { groupId: "g1" }),
      ]),
    ])

    const idx = buildBlockIndex(session)

    expect(idx.get("0-0")?.map((l) => l.id)).toEqual(["a", "c"])
    expect(idx.get("0-1")?.map((l) => l.id)).toEqual(["b"])
  })

  it("gives each groupless log its own single-log block", () => {
    const session = makeSession("s", [
      makeExercise([makeSetLog("a"), makeSetLog("b"), makeSetLog("c")]),
    ])

    const idx = buildBlockIndex(session)

    expect(idx.size).toBe(3)
    expect(idx.get("0-0")?.map((l) => l.id)).toEqual(["a"])
    expect(idx.get("0-1")?.map((l) => l.id)).toEqual(["b"])
    expect(idx.get("0-2")?.map((l) => l.id)).toEqual(["c"])
  })

  it("returns an empty Map for null and undefined sessions", () => {
    expect(buildBlockIndex(null).size).toBe(0)
    expect(buildBlockIndex(undefined).size).toBe(0)
  })

  it("keys a second exercise's blocks under 1-0, 1-1, …", () => {
    const session = makeSession("s", [
      makeExercise([makeSetLog("a", { groupId: "g1" })], "ex-1"),
      makeExercise(
        [makeSetLog("b", { groupId: "g2" }), makeSetLog("c", { groupId: "g3" })],
        "ex-2"
      ),
    ])

    const idx = buildBlockIndex(session)

    expect(idx.get("0-0")?.map((l) => l.id)).toEqual(["a"])
    expect(idx.get("1-0")?.map((l) => l.id)).toEqual(["b"])
    expect(idx.get("1-1")?.map((l) => l.id)).toEqual(["c"])
  })
})

// ─── derived cellState / completed maps ───────────────────────────────────────

describe("derived cellState / completed", () => {
  it("marks a block completed when every set is completed", () => {
    const session = makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1", state: "completed" }),
        makeSetLog("b", { groupId: "g1", state: "completed" }),
      ]),
    ])

    const { result } = makeHook(session)

    expect(result.current.cellState["0-0"]).toBe("completed")
    expect(result.current.completed["0-0"]).toBe(true)
  })

  it("marks a block skipped (not completed) when every set is skipped", () => {
    const session = makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1", state: "skipped" }),
        makeSetLog("b", { groupId: "g1", state: "skipped" }),
      ]),
    ])

    const { result } = makeHook(session)

    expect(result.current.cellState["0-0"]).toBe("skipped")
    expect(result.current.completed["0-0"]).toBe(false)
  })

  it("marks a mixed block pending", () => {
    const session = makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1", state: "completed" }),
        makeSetLog("b", { groupId: "g1", state: "skipped" }),
      ]),
    ])

    const { result } = makeHook(session)

    expect(result.current.cellState["0-0"]).toBe("pending")
  })

  it("treats a set with undefined state as pending", () => {
    const session = makeSession("s", [
      makeExercise([makeSetLog("a", { groupId: "g1" })]),
    ])

    const { result } = makeHook(session)

    expect(result.current.cellState["0-0"]).toBe("pending")
  })
})

// ─── cycleSet: optimistic flip + debounced fan-out ───────────────────────────

describe("cycleSet", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function pendingBlockSession() {
    return makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1", state: "pending" }),
        makeSetLog("b", { groupId: "g1", state: "pending" }),
      ]),
    ])
  }

  it("flips optimistically then fans one PATCH out to every set after the debounce", async () => {
    const { result, logSetBatchMock } = makeHook(pendingBlockSession())

    act(() => result.current.cycleSet("0-0"))
    expect(result.current.cellState["0-0"]).toBe("completed")

    // SET_STATE_DEBOUNCE_MS is 500 in the hook (kept unexported).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(logSetBatchMock).toHaveBeenCalledTimes(1)
    expect(logSetBatchMock).toHaveBeenCalledWith({
      updates: [
        { setLogId: "a", body: { state: "completed" } },
        { setLogId: "b", body: { state: "completed" } },
      ],
    })
  })

  it("fires no request when the user cycles all the way back to the server state", async () => {
    const { result, logSetBatchMock } = makeHook(pendingBlockSession())

    act(() => result.current.cycleSet("0-0")) // completed
    act(() => result.current.cycleSet("0-0")) // skipped
    act(() => result.current.cycleSet("0-0")) // pending (== server)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(logSetBatchMock).not.toHaveBeenCalled()
    expect(result.current.cellState["0-0"]).toBe("pending")
  })

  it("collapses two clicks into a single PATCH carrying the final state", async () => {
    const { result, logSetBatchMock } = makeHook(pendingBlockSession())

    act(() => result.current.cycleSet("0-0")) // completed
    act(() => result.current.cycleSet("0-0")) // skipped

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(logSetBatchMock).toHaveBeenCalledTimes(1)
    expect(logSetBatchMock).toHaveBeenCalledWith({
      updates: [
        { setLogId: "a", body: { state: "skipped" } },
        { setLogId: "b", body: { state: "skipped" } },
      ],
    })
  })

  it("drops the optimistic override and toasts when the PATCH fails", async () => {
    const logSetBatch = vi.fn().mockRejectedValue(new Error("network down"))
    const { result } = makeHook(pendingBlockSession(), { logSetBatch })

    act(() => result.current.cycleSet("0-0"))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(result.current.cellState["0-0"]).toBe("pending")
    expect(toast.error).toHaveBeenCalledTimes(1)
  })
})

// ─── blurLoad: block-level lb → kg fan-out ───────────────────────────────────

describe("blurLoad", () => {
  function twoSetBlock() {
    return makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1" }),
        makeSetLog("b", { groupId: "g1" }),
      ]),
    ])
  }

  it("fans the lb value out to every set converted to kg", async () => {
    const { result, logSetBatchMock } = makeHook(twoSetBlock())

    await act(async () => {
      await result.current.blurLoad("0-0", "225")
    })

    // 225 / 2.20462, rounded to 2dp.
    const expectedKg = Number((225 / 2.20462).toFixed(2))
    expect(expectedKg).toBe(102.06)
    expect(logSetBatchMock).toHaveBeenCalledWith({
      updates: [
        { setLogId: "a", body: { actualLoadKg: expectedKg } },
        { setLogId: "b", body: { actualLoadKg: expectedKg } },
      ],
    })
  })

  it("does not fire when the value equals the persisted display load", async () => {
    // 100 kg → round(100 * 2.20462) = 220 lb displayed.
    const session = makeSession("s", [
      makeExercise([makeSetLog("a", { groupId: "g1", actualLoadKg: 100 })]),
    ])
    const { result, logSetBatchMock } = makeHook(session)

    await act(async () => {
      await result.current.blurLoad("0-0", "220")
    })

    expect(logSetBatchMock).not.toHaveBeenCalled()
  })

  it("does not fire on an empty value", async () => {
    const { result, logSetBatchMock } = makeHook(twoSetBlock())

    await act(async () => {
      await result.current.blurLoad("0-0", "")
    })

    expect(logSetBatchMock).not.toHaveBeenCalled()
  })

  it("maps a 4xx error to the load cell without toasting", async () => {
    const logSetBatch = vi
      .fn()
      .mockRejectedValue(makeResponseError(400, { error: "actual_load_kg out of range" }))
    const { result } = makeHook(twoSetBlock(), { logSetBatch })

    await act(async () => {
      await result.current.blurLoad("0-0", "225")
    })

    expect(result.current.cellErrors["0-0:load"]).toBe("actual_load_kg out of range")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("toasts (no cell error) on a network-class error", async () => {
    const logSetBatch = vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    const { result } = makeHook(twoSetBlock(), { logSetBatch })

    await act(async () => {
      await result.current.blurLoad("0-0", "225")
    })

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(result.current.cellErrors["0-0:load"]).toBeUndefined()
  })

  it("currently maps a 401 to the load cell as 'Invalid value'", async () => {
    // NOTE: plan 002 changes 401 handling — update this test when it lands.
    const logSetBatch = vi.fn().mockRejectedValue(makeResponseError(401))
    const { result } = makeHook(twoSetBlock(), { logSetBatch })

    await act(async () => {
      await result.current.blurLoad("0-0", "225")
    })

    expect(result.current.cellErrors["0-0:load"]).toBe("Invalid value")
  })
})

// ─── blurRpe: last-set-only write ────────────────────────────────────────────

describe("blurRpe", () => {
  function threeSetBlock() {
    return makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1" }),
        makeSetLog("b", { groupId: "g1" }),
        makeSetLog("c", { groupId: "g1" }),
      ]),
    ])
  }

  it("writes the RPE only to the last set of the block", async () => {
    const { result, logSetMock } = makeHook(threeSetBlock())

    await act(async () => {
      await result.current.blurRpe("0-0", "8")
    })

    expect(logSetMock).toHaveBeenCalledTimes(1)
    expect(logSetMock).toHaveBeenCalledWith({ setLogId: "c", body: { actualRpe: 8 } })
  })

  it("does not fire when the value matches the last set's persisted RPE", async () => {
    const session = makeSession("s", [
      makeExercise([
        makeSetLog("a", { groupId: "g1" }),
        makeSetLog("b", { groupId: "g1", actualRpe: 8 }),
      ]),
    ])
    const { result, logSetMock } = makeHook(session)

    await act(async () => {
      await result.current.blurRpe("0-0", "8")
    })

    expect(logSetMock).not.toHaveBeenCalled()
  })

  it("maps a 4xx error to the rpe cell without toasting", async () => {
    const logSet = vi
      .fn()
      .mockRejectedValue(makeResponseError(400, { error: "actual_rpe out of range" }))
    const { result } = makeHook(threeSetBlock(), { logSet })

    await act(async () => {
      await result.current.blurRpe("0-0", "8")
    })

    expect(result.current.cellErrors["0-0:rpe"]).toBe("actual_rpe out of range")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("toasts on a network-class error", async () => {
    const logSet = vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    const { result } = makeHook(threeSetBlock(), { logSet })

    await act(async () => {
      await result.current.blurRpe("0-0", "8")
    })

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(result.current.cellErrors["0-0:rpe"]).toBeUndefined()
  })
})

// ─── input editors: validation gates ─────────────────────────────────────────

describe("editLoad / editRpe validation", () => {
  function oneBlock() {
    return makeSession("s", [makeExercise([makeSetLog("a", { groupId: "g1" })])])
  }

  it("editLoad rejects >4 digits and non-numeric input, accepts valid loads", () => {
    const { result } = makeHook(oneBlock())

    act(() => result.current.editLoad("0-0", "12345"))
    expect(result.current.loadEdits["0-0"]).toBeUndefined()

    act(() => result.current.editLoad("0-0", "1a"))
    expect(result.current.loadEdits["0-0"]).toBeUndefined()

    act(() => result.current.editLoad("0-0", "225"))
    expect(result.current.loadEdits["0-0"]).toBe("225")
  })

  it("editRpe rejects 11 and 0, accepts 10, 7, and empty", () => {
    const { result } = makeHook(oneBlock())

    act(() => result.current.editRpe("0-0", "11"))
    expect(result.current.rpeEdits["0-0"]).toBeUndefined()

    act(() => result.current.editRpe("0-0", "0"))
    expect(result.current.rpeEdits["0-0"]).toBeUndefined()

    act(() => result.current.editRpe("0-0", "10"))
    expect(result.current.rpeEdits["0-0"]).toBe("10")

    act(() => result.current.editRpe("0-0", "7"))
    expect(result.current.rpeEdits["0-0"]).toBe("7")

    act(() => result.current.editRpe("0-0", ""))
    expect(result.current.rpeEdits["0-0"]).toBe("")
  })
})
