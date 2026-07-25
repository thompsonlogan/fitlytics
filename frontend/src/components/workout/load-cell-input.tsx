import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type LoadCellInputProps = {
  cellKey: string
  edited: string | undefined
  persisted: number | ""
  error: string | undefined
  onEdit: (key: string, value: string) => void
  onBlur: (key: string, value: string) => void
  className?: string
  wrapperClassName?: string
}

export function LoadCellInput({
  cellKey,
  edited,
  persisted,
  error,
  onEdit,
  onBlur,
  className,
  wrapperClassName,
}: LoadCellInputProps) {
  const fallback = persisted == null || persisted === "" ? "" : String(persisted)
  const value = edited != null ? edited : fallback

  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", wrapperClassName)}>
      <Input
        value={value}
        onChange={(e) => onEdit(cellKey, e.target.value)}
        onBlur={(e) => onBlur(cellKey, e.target.value)}
        placeholder="—"
        inputMode="numeric"
        maxLength={4}
        title={error}
        aria-invalid={!!error}
        data-testid={`load-input-${cellKey}`}
        className={cn(
          className,
          value === "" && "text-muted-foreground",
          error && "border-destructive bg-destructive/10 text-destructive"
        )}
      />
      <span className="text-xs text-muted-foreground">lb</span>
    </span>
  )
}
