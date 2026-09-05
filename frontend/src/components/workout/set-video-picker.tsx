import { Loader2 } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

type SetVideoPickerProps = {
  count: number
  value: number
  filmed: boolean[]
  uploading: boolean[]
  onChange: (idx: number) => void
}

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
      className="-mx-4 [scrollbar-width:none] flex-nowrap overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
      aria-label="Which set?"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ToggleGroupItem
          key={i}
          value={String(i)}
          className="h-9.5 flex-none gap-1.5 px-3.5 text-[0.8125rem] md:h-8 md:px-3 md:text-xs"
        >
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
