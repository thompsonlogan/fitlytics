import { useMemo } from "react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Footprints, HeartPulse, MoreHorizontal, Moon, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
  totalSets,
  type ProgramDay,
  type WorkoutRow,
} from "@/lib/program-data"
import { cn } from "@/lib/utils"

type WorkoutTableProps = {
  day: ProgramDay
  completed: Record<string, boolean>
  loadEdits: Record<string, string>
  rpeEdits: Record<string, string>
  onToggleSet: (key: string) => void
  onEditLoad: (key: string, value: string) => void
  onEditRpe: (key: string, value: string) => void
}

type WorkoutTableMeta = {
  completed: Record<string, boolean>
  loadEdits: Record<string, string>
  rpeEdits: Record<string, string>
  onToggleSet: (key: string) => void
  onEditLoad: (key: string, value: string) => void
  onEditRpe: (key: string, value: string) => void
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
      const isDone = !!meta.completed[r.key]
      return (
        <Checkbox
          checked={isDone}
          onCheckedChange={() => meta.onToggleSet(r.key)}
          aria-label={`Mark ${r.exercise.name} set ${r.blIdx + 1} done`}
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
            <span className="mt-0.5 inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-medium tabular-nums text-muted-foreground">
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
  columnHelper.accessor((row) => row.block.reps, {
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
    header: () => "Cap",
    cell: (info) => (
      <span className="tabular-nums text-muted-foreground">
        {info.getValue() === "" ? "—" : info.getValue()}
      </span>
    ),
  }),
  columnHelper.display({
    id: "load",
    header: () => "Load used",
    cell: ({ row, table }) => {
      const meta = table.options.meta as WorkoutTableMeta
      const r = row.original
      const edited = meta.loadEdits[r.key]
      const value =
        edited != null ? edited : r.block.used === "" ? "" : String(r.block.used)
      const isEmpty = value === ""
      return (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Input
            value={value}
            onChange={(e) => meta.onEditLoad(r.key, e.target.value)}
            placeholder="—"
            inputMode="numeric"
            maxLength={4}
            className={cn(
              "h-6 w-14 border-transparent bg-transparent px-1.5 text-right text-[0.8125rem] tabular-nums shadow-none hover:border-input hover:bg-background",
              isEmpty && "text-muted-foreground",
            )}
          />
          <span className="text-xs text-muted-foreground">lb</span>
        </span>
      )
    },
  }),
  columnHelper.display({
    id: "rpe",
    header: () => "RPE",
    cell: ({ row, table }) => {
      const meta = table.options.meta as WorkoutTableMeta
      const r = row.original
      const edited = meta.rpeEdits[r.key]
      const value =
        edited != null ? edited : r.block.rpe == null ? "" : String(r.block.rpe)
      const numeric = parseInt(value, 10)
      const isHigh = !Number.isNaN(numeric) && numeric >= 9
      const isEmpty = value === ""
      return (
        <Input
          value={value}
          onChange={(e) => meta.onEditRpe(r.key, e.target.value)}
          placeholder="—"
          inputMode="numeric"
          maxLength={2}
          aria-label={`RPE for ${r.exercise.name} set ${r.blIdx + 1}`}
          className={cn(
            "mx-auto inline-flex h-[1.125rem] w-10 items-center justify-center rounded-full border-transparent bg-muted px-1.5 text-center text-[0.6875rem] font-medium tabular-nums shadow-none hover:border-input hover:bg-background focus-visible:bg-background",
            isHigh && "bg-destructive/10 text-destructive",
            isEmpty &&
              "border border-dashed border-border bg-transparent text-muted-foreground",
          )}
        />
      )
    },
  }),
]

export function WorkoutTable({
  day,
  completed,
  loadEdits,
  rpeEdits,
  onToggleSet,
  onEditLoad,
  onEditRpe,
}: WorkoutTableProps) {
  const data = useMemo(() => flattenRows(day), [day])

  const table = useReactTable({
    data,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      completed,
      loadEdits,
      rpeEdits,
      onToggleSet,
      onEditLoad,
      onEditRpe,
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
        <div className="flex-1" />
        <Button variant="ghost" size="xs">
          <Plus className="size-3" />
          Add exercise
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="More">
          <MoreHorizontal className="size-3" />
        </Button>
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
        </colgroup>
        <TableHeader className="[&_tr]:border-b-0">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const colId = header.column.id
                const isNumeric = ["rest", "sets", "reps", "cap", "load"].includes(colId)
                const isCenter = colId === "rpe"
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "sticky top-0 z-10 h-auto border-b bg-background px-2.5 py-1.5 text-[0.6875rem] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase",
                      isNumeric && "text-right",
                      isCenter && "text-center",
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
            const isDone = !!completed[r.key]
            return (
              <TableRow
                key={row.id}
                className={cn(
                  "hover:bg-muted/40",
                  r.first && rowIdx > 0 && "border-t",
                  isDone &&
                    "[&_td:not([data-discipline])]:text-muted-foreground [&_td:not([data-discipline])]:line-through",
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id
                  if (SKIP_FOR_NON_FIRST.has(colId) && !r.first) return null
                  const rowSpan = colId === "discipline" ? r.rowSpan : undefined
                  const isNumeric = ["rest", "sets", "reps", "cap", "load"].includes(colId)
                  const isCenter = colId === "rpe"
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
                        colId === "check" && "w-7",
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
        <div className="flex-1" />
        <Button variant="ghost" size="xs">
          <Plus className="size-3" />
          Log activity
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
          <Moon className="size-[1.125rem]" />
        </div>
        <h3 className="m-0 text-[0.9375rem] font-semibold text-foreground">Programmed rest</h3>
        <p className="m-0 max-w-72 text-[0.8125rem] leading-relaxed">
          No session scheduled. Log a recovery walk, mobility, or skip to keep your streak.
          Programmed strain returns next session.
        </p>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" size="sm">
            <Footprints className="size-3.5" />
            Log walk
          </Button>
          <Button variant="outline" size="sm">
            <HeartPulse className="size-3.5" />
            Log mobility
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
