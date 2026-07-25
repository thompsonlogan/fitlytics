import type { ReactNode } from "react"
import { vi } from "vitest"

type LinkProps = {
  to?: string
  params?: Record<string, string>
  children?: ReactNode
  [key: string]: unknown
}

function resolve(to: string, params: Record<string, string> = {}): string {
  return to.replace(/\$(\w+)/g, (_match, key: string) => params[key] ?? `$${key}`)
}

export const routerMock = {
  Link: ({ to = "", params, children, ...rest }: LinkProps) => (
    <a href={resolve(to, params)} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}
