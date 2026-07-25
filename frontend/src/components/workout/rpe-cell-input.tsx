import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type RpeCellInputProps = {
  cellKey: string
  edited: string | undefined
  persisted: number | null
  error: string | undefined
  ariaLabel: string
  onEdit: (key: string, value: string) => void
  onBlur: (key: string, value: string) => void
  className?: string
  emptyClassName?: string
}

export function RpeCellInput({
  cellKey,
  edited,
  persisted,
  error,
  ariaLabel,
  onEdit,
  onBlur,
  className,
  emptyClassName,
}: RpeCellInputProps) {
  const fallback = persisted == null ? "" : String(persisted)
  const value = edited != null ? edited : fallback

  return (
    <Input
      value={value}
      onChange={(e) => onEdit(cellKey, e.target.value)}
      onBlur={(e) => onBlur(cellKey, e.target.value)}
      placeholder="—"
      inputMode="numeric"
      maxLength={2}
      aria-label={ariaLabel}
      aria-invalid={!!error}
      title={error}
      data-testid={`rpe-input-${cellKey}`}
      className={cn(
        className,
        value === "" && emptyClassName,
        error && "border border-destructive bg-destructive/10 text-destructive"
      )}
    />
  )
}
