import { Fragment } from "react"

import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"

export type Crumb = {
  label: string
  to?: string
}

export function SubBarBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase"
    >
      {crumbs.map((crumb, i) => (
        <Fragment key={`${crumb.label}-${i}`}>
          {i > 0 && <ChevronRight className="size-2.5" />}
          {crumb.to ? (
            <Link to={crumb.to} className="transition-colors hover:text-foreground">
              {crumb.label}
            </Link>
          ) : (
            <span>{crumb.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
