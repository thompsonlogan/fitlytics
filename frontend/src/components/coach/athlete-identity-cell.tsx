import { initials } from "@/lib/relative-time"

type AthleteIdentityCellProps = {
  displayName: string
  email?: string
}

export function AthleteIdentityCell({ displayName, email }: AthleteIdentityCellProps) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-semibold text-muted-foreground">
        {initials(displayName)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[0.8125rem] font-medium">{displayName}</span>
        {email && (
          <span className="block truncate text-[0.6875rem] text-muted-foreground">{email}</span>
        )}
      </span>
    </div>
  )
}
