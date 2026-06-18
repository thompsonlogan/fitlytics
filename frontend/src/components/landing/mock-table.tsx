import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

// A static replica of the workout tracker table, used inside the hero product
// shot and the program-tracking feature row. Purely presentational marketing
// content — the real tracker lives in components/workout/workout-table.tsx.

export type MockRow = {
  // Stable identity for React's list key. The exercise name repeats across rows
  // (e.g. multiple "Comp Bench" sets), so we can't key on content alone.
  id: string
  done?: boolean
  exercise: string
  sets: string
  reps: string
  intensity: string
  load: string
  rpe: string
  rpeHot?: boolean
}

const HEAD = "h-auto px-4 py-2 text-[0.625rem] font-medium tracking-[0.05em] text-muted-foreground uppercase"
const CELL = "px-4 py-[0.4375rem]"

export function MockTable({ rows }: { rows: MockRow[] }) {
  return (
    <Table containerClassName="overflow-visible" className="text-[0.8125rem]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(HEAD, "w-4")} />
          <TableHead className={HEAD}>Discipline</TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Sets</TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Reps</TableHead>
          <TableHead className={HEAD}>Intensity</TableHead>
          <TableHead className={cn(HEAD, "text-right")}>Load</TableHead>
          <TableHead className={cn(HEAD, "text-center")}>RPE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const dim = row.done ? "text-muted-foreground" : undefined
          return (
            <TableRow key={row.id} className="hover:bg-transparent">
              <TableCell className={CELL}>
                <Checkbox
                  checked={Boolean(row.done)}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none size-[0.9375rem] border-border"
                />
              </TableCell>
              <TableCell className={cn(CELL, "font-medium", dim)}>{row.exercise}</TableCell>
              <TableCell className={cn(CELL, "text-right tabular-nums", dim)}>{row.sets}</TableCell>
              <TableCell className={cn(CELL, "text-right tabular-nums", dim)}>{row.reps}</TableCell>
              <TableCell className={cn(CELL, "text-muted-foreground")}>{row.intensity}</TableCell>
              <TableCell className={cn(CELL, "text-right tabular-nums", dim)}>{row.load}</TableCell>
              <TableCell className={cn(CELL, "text-center")}>
                <Badge
                  variant={row.rpeHot ? "destructive" : "secondary"}
                  className="h-[1.0625rem] rounded-full px-1.5 text-[0.6875rem] font-medium tabular-nums"
                >
                  {row.rpe}
                </Badge>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
