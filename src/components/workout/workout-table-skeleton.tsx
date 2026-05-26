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

const HEADERS = [
  { id: "check", label: "" },
  { id: "discipline", label: "Discipline" },
  { id: "rest", label: "Rest" },
  { id: "sets", label: "Sets" },
  { id: "reps", label: "Reps" },
  { id: "intensity", label: "Intensity / weight" },
  { id: "cap", label: "Cap" },
  { id: "load", label: "Load used" },
  { id: "rpe", label: "RPE" },
] as const

// SKELETON_ROW_COUNT picks a row count that's close to a typical session
// (4–6 exercises × ~2 set blocks each) so the table doesn't visibly resize
// when real data arrives.
const SKELETON_ROW_COUNT = 8

// WorkoutTableSkeleton mirrors the column widths and chrome of WorkoutTable
// exactly so swapping from skeleton → table on load doesn't shift anything
// on the page. Only the cell contents differ — solid shimmer rectangles in
// place of the real values.
export function WorkoutTableSkeleton() {
  return (
    <Card
      className="flex min-h-0 flex-col gap-0 py-0"
      role="status"
      aria-label="Loading workout"
      aria-busy="true"
      data-testid="workout-table-skeleton"
    >
      <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">Session plan</CardTitle>
        <Skeleton className="h-3 w-40" />
        <div className="flex-1" />
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
          <TableRow className="hover:bg-transparent">
            {HEADERS.map((h) => (
              <TableHead
                key={h.id}
                className="sticky top-0 z-10 h-auto border-b bg-background px-2.5 py-1.5 text-[0.6875rem] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase"
              >
                {h.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell className="w-7 px-2.5 py-1.5">
                <Skeleton className="size-4 rounded" />
              </TableCell>
              <TableCell className="border-r px-2.5 py-1.5">
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </TableCell>
              <TableCell className="px-2.5 py-1.5">
                <Skeleton className="ml-auto h-3.5 w-6" />
              </TableCell>
              <TableCell className="px-2.5 py-1.5">
                <Skeleton className="ml-auto h-3.5 w-4" />
              </TableCell>
              <TableCell className="px-2.5 py-1.5">
                <Skeleton className="ml-auto h-3.5 w-8" />
              </TableCell>
              <TableCell className="px-2.5 py-1.5">
                <Skeleton className="ml-auto h-3.5 w-20" />
              </TableCell>
              <TableCell className="px-2.5 py-1.5">
                <Skeleton className="ml-auto h-3.5 w-8" />
              </TableCell>
              <TableCell className="px-2.5 py-1.5">
                <Skeleton className="ml-auto h-5 w-16 rounded" />
              </TableCell>
              <TableCell className="px-2.5 py-1.5">
                <Skeleton className="mx-auto h-[1.125rem] w-10 rounded-full" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <span className="sr-only">Loading session…</span>
    </Card>
  )
}
