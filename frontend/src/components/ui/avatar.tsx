import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "@/lib/utils"

function Avatar({ className, ...props }: AvatarPrimitive.Root.Props) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  )
}

// AvatarImage / AvatarFallback live in their own files (one component per file)
// but are re-exported here so `@/components/ui/avatar` stays the single import
// site for the avatar compound component.
export { Avatar }
export { AvatarImage } from "./avatar-image"
export { AvatarFallback } from "./avatar-fallback"
