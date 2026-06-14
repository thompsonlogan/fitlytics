import { Loader2 } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

type SetVideoPickerProps = {
  count: number
  value: number
  // filmed[i] / uploading[i] describe the status of set i within the block.
  filmed: boolean[]
  uploading: boolean[]
  onChange: (idx: number) => void
}

// SetVideoPicker is the segmented "Set 1 / Set 2…" control inside the upload
// dialog: a video binds to one physical set, so the user picks which. A filmed
// set shows a dot; an in-flight upload shows a spinner.
export function SetVideoPicker({ count, value, filmed, uploading, onChange }: SetVideoPickerProps) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[String(value)]}
      onValueChange={(groupValue: string[]) => {
        const next = groupValue[0]
        if (next != null) onChange(Number(next))
      }}
      className="flex-wrap"
      aria-label="Which set?"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ToggleGroupItem key={i} value={String(i)} className="gap-1.5">
          <span>Set {i + 1}</span>
          {uploading[i] ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : filmed[i] ? (
            <span className={cn("size-1.5 rounded-full bg-emerald-500")} aria-label="filmed" />
          ) : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
