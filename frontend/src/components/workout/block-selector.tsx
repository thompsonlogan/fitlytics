import { Check, ChevronDown } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ProgramBlock } from "@/lib/program-data"
import { cn } from "@/lib/utils"

type BlockSelectorProps = {
  blocks: ProgramBlock[]
  activeBlockSequence: number
  onBlockChange: (sequence: number) => void
  className?: string
  buttonClassName?: string
}

function blockLabel(b: ProgramBlock): string {
  return b.name?.trim() || `Block ${b.sequence}`
}

// BlockSelector is the dropdown that scopes the week pager to one training
// block. Shared by the desktop and mobile sub-bars. Renders nothing for a
// single-block program — there is nothing to switch between.
export function BlockSelector({
  blocks,
  activeBlockSequence,
  onBlockChange,
  className,
  buttonClassName,
}: BlockSelectorProps) {
  if (blocks.length <= 1) return null

  const active = blocks.find((b) => b.sequence === activeBlockSequence) ?? blocks[0]

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Training block"
              className={cn(
                "inline-flex h-8 w-full items-center justify-between gap-1.5 rounded-md border bg-background px-2.5 text-[0.8125rem] font-medium transition-colors hover:bg-muted md:h-7 md:w-auto",
                buttonClassName
              )}
            >
              <span className="truncate">{blockLabel(active)}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-48 p-1.5">
          {blocks.map((b) => {
            const isActive = b.sequence === active.sequence
            return (
              <DropdownMenuItem
                key={b.id || b.sequence}
                onClick={() => onBlockChange(b.sequence)}
                className="justify-between gap-3"
              >
                <span className="flex items-center gap-2">
                  <Check className={cn("size-3.5", isActive ? "opacity-100" : "opacity-0")} />
                  {blockLabel(b)}
                </span>
                <span className="text-xs text-muted-foreground">
                  wk {b.weekStart}–{b.weekEnd}
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
