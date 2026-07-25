import { useMemo } from "react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Moon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadCellInput } from "@/components/workout/load-cell-input"
import { RpeCellInput } from "@/components/workout/rpe-cell-input"
import { SetStateCell } from "@/components/workout/set-state-cell"
import { type SetState } from "@/components/workout/set-state"
import { VideoCell } from "@/components/workout/video-cell"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  flattenRows,
  formatReps,
  totalSets,
  type ProgramDay,
  type WorkoutRow,
} from "@/lib/program-data"
import { cn } from "@/lib/utils"

type WorkoutTableProps = {
  day: ProgramDay
  cellState: Record<string, SetState>
  loadEdits: Record<string, string>
  rpeEdits: Record<string, string>
  // persistedLoad/persistedRpe carry the session-backed actuals. Empty / null
  // when the user has never logged that cell. Keyed by `${exIdx}-${blIdx}`
  // to match WorkoutRow.key.
  persistedLoad: Record<string, number | "">
  persistedRpe: Record<string, number | null>
  // cellErrors keys are `${rowKey}:${field}` (e.g. "0-1:load"). Presence of a
  // key means "show the error UI on this cell"; the value is the message.
  cellErrors: Record<string, string>
  // videoInfo carries the per-block filmed summary keyed by WorkoutRow.key.
  videoInfo: Record<string, { filmedCount: number; firstFilmedSet: number | null }>
  onCycleSet: (key: string) => void
  onEditLoad: (key: string, value: string) => void
  onEditRpe: (key: string, value: string) => void
  onBlurLoad: (key: string, value: string) => void
  onBlurRpe: (key: string, value: string) => void
  onOpenVideo: (key: string, initialSet: number) => void
}

type WorkoutTableMeta = {
  cellState: Record<string, SetState>
  loadEdits: Record<string, string>
  rpeEdits: Record<string, string>
  persistedLoad: Record<string, number | "">
  persistedRpe: Record<string, number | null>
  cellErrors: Record<string, string>
  videoInfo: Record<string, { filmedCount: number; firstFilmedSet: number | null }>
  onCycleSet: (key: string) => void
  onEditLoad: (key: string, value: string) => void
  onEditRpe: (key: string, value: string) => void
  onBlurLoad: (key: string, value: string) => void
  onBlurRpe: (key: string, value: string) => void
  onOpenVideo: (key: string, initialSet: number) => void
}

const columnHelper = createColumnHelper<WorkoutRow>()

const SKIP_FOR_NON_FIRST = new Set(["discipline"])

const COLUMNS = [
  columnHelper.display({
    id: "check",
    header: () => null,
    cell: ({ row, table }) => {
      const meta = table.options.meta as WorkoutTableMeta
      const r = row.original
      const state = meta.cellState[r.key] ?? "pending"
      return (
        <SetStateCell
          state={state}
          onCycle={() => meta.onCycleSet(r.key)}
          ariaLabel={`${r.exercise.name} set ${r.blIdx + 1}: ${state}. Click to cycle.`}
        />
      )
    },
  }),
  columnHelper.display({
    id: "discipline",
    header: () => "Discipline",
    cell: ({ row }) => {
      const r = row.original
      return (
        <div className="flex flex-col">
          <div className="flex items-start gap-2 font-medium text-foreground">
            <span className="mt-0.5 inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-medium text-muted-foreground tabular-nums">
              {r.exNum}
            </span>
            <span>{r.exercise.name}</span>
          </div>
          <div className="mt-0.5 ml-6.5 text-[0.6875rem] font-normal text-muted-foreground">
            {r.exercise.sub ? `${r.exercise.sub} · ` : ""}rest {r.exercise.rest} min
          </div>
        </div>
      )
    },
  }),
  columnHelper.accessor((row) => row.exercise.rest, {
    id: "rest",
    header: () => "Rest",
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => row.block.sets, {
    id: "sets",
    header: () => "Sets",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => formatReps(row.block.repsMin, row.block.repsMax), {
    id: "reps",
    header: () => "Reps",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => row.block.intensity, {
    id: "intensity",
    header: () => "Intensity / weight",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => row.block.cap, {
    id: "cap",
    header: () => "Load Cap",
    cell: (info) => (
      <span className="text-muted-foreground tabular-nums">
        {info.getValue() === "" ? "—" : info.getValue()}
      </span>
    ),
  }),
  columnHelper.display({
    id: "load",
    header: () => "Load Used",
    cell: ({ row, table }) => {
      const meta = table.options.meta as WorkoutTableMeta
      const r = row.original
      return (
        <LoadCellInput
          cellKey={r.key}
          edited={meta.loadEdits[r.key]}
          persisted={meta.persistedLoad[r.key]}
          error={meta.cellErrors[`${r.key}:load`]}
          onEdit={meta.onEditLoad}
          onBlur={meta.onBlurLoad}
          className="h-6 w-14 border-transparent bg-transparent px-1.5 text-right text-[0.8125rem] tabular-nums shadow-none hover:border-input hover:bg-background"
        />
      )
    },
  }),
  columnHelper.display({
    id: "rpe",
    header: () => "Last Set RPE",
    cell: ({ row, table }) => {
      const meta = table.options.meta as WorkoutTableMeta
      const r = row.original
      return (
        <RpeCellInput
          cellKey={r.key}
          edited={meta.rpeEdits[r.key]}
          persisted={meta.persistedRpe[r.key]}
          error={meta.cellErrors[`${r.key}:rpe`]}
          ariaLabel={`RPE for ${r.exercise.name} set ${r.blIdx + 1}`}
          onEdit={meta.onEditRpe}
          onBlur={meta.onBlurRpe}
          className="mx-auto inline-flex h-[1.125rem] w-10 items-center justify-center rounded-full border-transparent bg-muted px-1.5 text-center text-[0.6875rem] font-medium tabular-nums shadow-none hover:border-input hover:bg-background focus-visible:bg-background"
          emptyClassName="border border-dashed border-border bg-transparent text-muted-foreground"
        />
      )
    },
  }),
  columnHelper.display({
    id: "video",
    header: () => null,
    cell: ({ row, table }) => {
      const meta = table.options.meta as WorkoutTableMeta
      const r = row.original
      const info = meta.videoInfo[r.key] ?? { filmedCount: 0, firstFilmedSet: null }
      return (
        <VideoCell
          filmedCount={info.filmedCount}
          totalSets={r.block.sets}
          firstFilmedSet={info.firstFilmedSet}
          exerciseName={r.exercise.name}
          onOpen={(initialSet) => meta.onOpenVideo(r.key, initialSet)}
        />
      )
    },
  }),
]

export function WorkoutTable({
  day,
  cellState,
  loadEdits,
  rpeEdits,
  persistedLoad,
  persistedRpe,
  cellErrors,
  videoInfo,
  onCycleSet,
  onEditLoad,
  onEditRpe,
  onBlurLoad,
  onBlurRpe,
  onOpenVideo,
}: WorkoutTableProps) {
  const data = useMemo(() => flattenRows(day), [day])

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      cellState,
      loadEdits,
      rpeEdits,
      persistedLoad,
      persistedRpe,
      cellErrors,
      videoInfo,
      onCycleSet,
      onEditLoad,
      onEditRpe,
      onBlurLoad,
      onBlurRpe,
      onOpenVideo,
    } satisfies WorkoutTableMeta,
  })

  const exerciseCount = day.exercises?.length ?? 0

  return (
    <Card className="flex min-h-0 flex-col gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">Session plan</CardTitle>
        <span className="text-xs text-muted-foreground">
          {exerciseCount} exercises · {totalSets(day)} working sets
        </span>
      </CardHeader>
      <Table
        containerClassName="min-h-0 flex-1 overflow-auto"
        className="text-[0.8125rem]"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: "2.5rem" }} />
          <col style={{ minWidth: "11rem", width: "22%" }} />
          <col style={{ width: "4rem" }} />
          <col style={{ width: "3.5rem" }} />
          <col style={{ width: "4.5rem" }} />
          <col style={{ minWidth: "8rem", width: "20%" }} />
          <col style={{ width: "4.5rem" }} />
          <col style={{ width: "6.5rem" }} />
          <col style={{ width: "4.5rem" }} />
          <col style={{ width: "3rem" }} />
        </colgroup>
        <TableHeader className="[&_tr]:border-b-0">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const colId = header.column.id
                const isNumeric = ["rest", "sets", "reps", "cap", "load"].includes(colId)
                const isCenter = colId === "rpe" || colId === "video"
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "sticky top-0 z-10 h-auto border-b bg-background px-2.5 py-1.5 text-[0.6875rem] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase",
                      isNumeric && "text-right",
                      isCenter && "text-center"
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row, rowIdx) => {
            const r = row.original
            const rowState = cellState[r.key] ?? "pending"
            const isTerminal = rowState === "completed" || rowState === "skipped"
            return (
              <TableRow
                key={row.id}
                className={cn(
                  "hover:bg-muted/40",
                  r.first && rowIdx > 0 && "border-t",
                  isTerminal &&
                    "[&_td:not([data-discipline])]:text-muted-foreground [&_td:not([data-discipline])]:line-through"
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id
                  if (SKIP_FOR_NON_FIRST.has(colId) && !r.first) return null
                  const rowSpan = colId === "discipline" ? r.rowSpan : undefined
                  const isNumeric = ["rest", "sets", "reps", "cap", "load"].includes(colId)
                  const isCenter = colId === "rpe" || colId === "video"
                  const isDiscipline = colId === "discipline"
                  return (
                    <TableCell
                      key={cell.id}
                      rowSpan={rowSpan}
                      data-discipline={isDiscipline ? "" : undefined}
                      className={cn(
                        "px-2.5 py-1.5 align-middle whitespace-nowrap",
                        isNumeric && "text-right",
                        isCenter && "text-center",
                        isDiscipline && "border-r align-top whitespace-normal",
                        colId === "check" && "w-7"
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}

export function RestDayCard({ name }: { name: string }) {
  return (
    <Card size="sm" className="flex min-h-0 flex-col gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">{name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
          <Moon className="size-[1.125rem]" />
        </div>
        <h3 className="m-0 text-[0.9375rem] font-semibold text-foreground">Programmed rest</h3>
        <p className="m-0 max-w-72 text-[0.8125rem] leading-relaxed">
          No session scheduled today. Programmed strain returns next session.
        </p>
      </CardContent>
    </Card>
  )
}
