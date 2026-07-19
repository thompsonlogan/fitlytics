import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const COLUMNS = ["", "Exercise", "Sets", "Reps", "Prescription", "Target", "Actual", "RPE", "Video"]

export function CoachWorkoutTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card className="flex min-h-0 flex-col gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">Prescribed vs actual</CardTitle>
      </CardHeader>

      <Table className="text-[0.8125rem]">
        <TableHeader>
          <TableRow>
            {COLUMNS.map((label, i) => (
              <TableHead
                key={label || `col-${i}`}
                className="h-auto px-2.5 py-1.5 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase"
              >
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, i) => (
            <TableRow key={i}>
              {COLUMNS.map((label, c) => (
                <TableCell key={label || `col-${c}`} className="px-2.5 py-2">
                  <Skeleton className={c === 1 ? "h-4 w-40" : "h-4 w-10"} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
