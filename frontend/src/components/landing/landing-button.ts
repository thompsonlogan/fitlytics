import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

// Marketing CTAs are links, so they're styled with shadcn's `buttonVariants`
// (the shadcn-idiomatic way to make an <a>/<Link> look like a Button) plus the
// landing design's larger scale. Real <button> elements use <Button> directly.

type Variant = "primary" | "outline" | "ghost"
type Size = "sm" | "md" | "lg"

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-12 px-6 text-base",
}

// Map the marketing variants onto shadcn Button variants, then layer on a
// subtle hover lift the design uses for its primary CTAs.
const VARIANT: Record<Variant, { base: "default" | "outline" | "ghost"; extra?: string }> = {
  primary: { base: "default", extra: "hover:-translate-y-px" },
  outline: { base: "outline" },
  ghost: { base: "ghost" },
}

export function landingButton({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  const { base, extra } = VARIANT[variant]
  return cn(
    buttonVariants({ variant: base }),
    "gap-2 rounded-md [&_svg]:size-[1.0625rem]",
    SIZE[size],
    extra,
    className
  )
}
