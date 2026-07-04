import {
  ChevronDown,
  Download,
  Keyboard,
  LifeBuoy,
  LogOut,
  Settings,
  Trophy,
  User,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { MeResponse } from "@/services/generated"

type AccountMenuProps = {
  user: MeResponse | null
  onLogout: () => void
}

// AccountMenu is the avatar-triggered account dropdown shared by the desktop
// header and the mobile app bar. The trigger is just the initials pill + a
// chevron; the menu content is identical across layouts.
export function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const displayName = user?.displayName?.trim() || user?.email || "Account"
  const email = user?.email ?? ""
  const initials = getInitials(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Account menu"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1.5 pl-0.5 text-xs transition-colors hover:bg-muted"
          >
            <span className="inline-flex size-[1.375rem] items-center justify-center rounded-full bg-foreground text-[0.6875rem] font-semibold text-background">
              {initials}
            </span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-1 pb-2">
            <span className="text-[0.8125rem] font-semibold text-foreground">{displayName}</span>
            {email && <span className="text-xs font-normal text-muted-foreground">{email}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User className="size-3.5" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="size-3.5" />
          <span>Settings</span>
          <DropdownMenuShortcut>,</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Trophy className="size-3.5" />
          <span>Achievements</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Download className="size-3.5" />
          <span>Export data</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LifeBuoy className="size-3.5" />
          <span>Help &amp; feedback</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Keyboard className="size-3.5" />
          <span>Keyboard shortcuts</span>
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <LogOut className="size-3.5" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getInitials(user: MeResponse | null): string {
  const name = user?.displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (user?.email) {
    return user.email[0].toUpperCase()
  }
  return "?"
}
