import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  "on-track": {
    label: "On track",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  attention: {
    label: "Attention",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  new: {
    label: "New",
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-400",
  },
}

export function AthleteStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status]

  if (!style) {
    return <span className="text-[0.75rem] text-muted-foreground">{status}</span>
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.75rem] font-medium",
        style.text
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  )
}
