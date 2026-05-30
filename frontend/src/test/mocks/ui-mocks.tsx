// Thin pass-through replacements for the shadcn primitives in
// `src/components/ui/`. Wired up globally in `test_setup.ts` via `vi.mock`.
//
// Why mock these in tests:
//   - The real components import `@base-ui/react` (Button, Checkbox, Input,
//     Separator, Tooltip, DropdownMenu, Badge), which pulls in popover /
//     portal / focus-management machinery that tests don't exercise.
//   - Skipping that work makes the import phase of vitest measurably faster
//     and keeps test runs from depending on DOM features (Portals, layout
//     measurement) that jsdom does not implement faithfully.
//
// What the mocks must preserve:
//   - The semantic HTML element so `getByRole("button" | "checkbox" | …)`
//     queries keep working.
//   - The `data-slot` attribute so any future selector-based tests can
//     target the primitive by its shadcn marker.
//   - The public prop surface used in this app (variant/size/asChild are
//     accepted and ignored; standard HTML props are forwarded).
//
// What the mocks deliberately drop:
//   - All Tailwind classes (consumers attach their own via className; we
//     forward className so consumer styling still appears in snapshots).
//   - Animation / open-close state machines.
//   - Portal rendering — Tooltip/Dropdown content renders inline so it's
//     queryable without extra setup.

import * as React from "react"

// ─── Shared helpers ────────────────────────────────────────────────────────

// passProps lifts the consumer's className through while tagging the element
// with its shadcn slot, which is the contract the real components honor.
function withSlot<P extends { className?: string }>(
  slot: string,
  props: P
): P & { "data-slot": string } {
  return { "data-slot": slot, ...props }
}

// renderChildren is the universal mock body for any wrapper component whose
// only job in the real impl is to inject context or open/close logic — we
// just return the children inline (Tooltip.Provider, DropdownMenu.Root, etc.).
function renderChildren({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

// ─── badge ─────────────────────────────────────────────────────────────────
// Real: base-ui useRender + cva variants. Mock: a <span>.

export const badgeMock = {
  Badge: function Badge({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { variant?: string; asChild?: boolean }) {
    return <span {...withSlot("badge", { className, ...props })}>{children}</span>
  },
  // Tests don't query the cva variants directly, but the real module exports
  // `badgeVariants` so the type surface stays compatible.
  badgeVariants: () => "",
}

// ─── button ────────────────────────────────────────────────────────────────
// Real: base-ui Button + cva. Mock: <button> with HTML defaults.

type ButtonExtras = {
  variant?: string
  size?: string
  asChild?: boolean
}

export const buttonMock = {
  Button: function Button({
    className,
    children,
    type = "button",
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & ButtonExtras) {
    // Strip the cva-only props so React doesn't warn about unknown DOM attrs.
    const { variant: _v, size: _s, asChild: _a, ...rest } = props
    return (
      <button type={type} {...withSlot("button", { className, ...rest })}>
        {children}
      </button>
    )
  },
  buttonVariants: () => "",
}

// ─── card ──────────────────────────────────────────────────────────────────
// Real: light wrappers over <div>. Mocking still pays off because tests don't
// need the size-variant attribute soup the real impl emits.

function makeDivMock(slot: string) {
  return function CardSlot({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...withSlot(slot, { className, ...props })}>{children}</div>
  }
}

export const cardMock = {
  Card: makeDivMock("card"),
  CardHeader: makeDivMock("card-header"),
  CardFooter: makeDivMock("card-footer"),
  CardTitle: makeDivMock("card-title"),
  CardAction: makeDivMock("card-action"),
  CardDescription: makeDivMock("card-description"),
  CardContent: makeDivMock("card-content"),
}

// ─── checkbox ──────────────────────────────────────────────────────────────
// Real: base-ui Checkbox (custom state machine, indicator child). Mock: a
// native <input type="checkbox"> so role="checkbox" + checked work in tests.

type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const checkboxMock = {
  Checkbox: function Checkbox({ checked, onCheckedChange, className, ...props }: CheckboxProps) {
    return (
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onCheckedChange?.(e.currentTarget.checked)}
        {...withSlot("checkbox", { className, ...props })}
      />
    )
  },
}

// ─── dropdown-menu ─────────────────────────────────────────────────────────
// Real: base-ui Menu (portal + popover positioning). Mock: render content
// inline so tests can query menu items without opening anything.

function makeFragmentMock() {
  return renderChildren
}

export const dropdownMenuMock = {
  DropdownMenu: makeFragmentMock(),
  DropdownMenuPortal: makeFragmentMock(),
  DropdownMenuTrigger: function DropdownMenuTrigger({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLButtonElement>) {
    return (
      <button {...withSlot("dropdown-menu-trigger", { className, ...props })}>{children}</button>
    )
  },
  DropdownMenuContent: makeDivMock("dropdown-menu-content"),
  DropdownMenuGroup: makeDivMock("dropdown-menu-group"),
  DropdownMenuLabel: makeDivMock("dropdown-menu-label"),
  DropdownMenuItem: function DropdownMenuItem({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div role="menuitem" {...withSlot("dropdown-menu-item", { className, ...props })}>
        {children}
      </div>
    )
  },
  DropdownMenuCheckboxItem: function DropdownMenuCheckboxItem({
    className,
    children,
    checked,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { checked?: boolean }) {
    return (
      <div
        role="menuitemcheckbox"
        aria-checked={!!checked}
        {...withSlot("dropdown-menu-checkbox-item", { className, ...props })}
      >
        {children}
      </div>
    )
  },
  DropdownMenuRadioGroup: makeDivMock("dropdown-menu-radio-group"),
  DropdownMenuRadioItem: function DropdownMenuRadioItem({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div role="menuitemradio" {...withSlot("dropdown-menu-radio-item", { className, ...props })}>
        {children}
      </div>
    )
  },
  DropdownMenuSeparator: function DropdownMenuSeparator({
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div role="separator" {...withSlot("dropdown-menu-separator", { className, ...props })} />
    )
  },
  DropdownMenuShortcut: function DropdownMenuShortcut({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement>) {
    return <span {...withSlot("dropdown-menu-shortcut", { className, ...props })}>{children}</span>
  },
  DropdownMenuSub: makeFragmentMock(),
  DropdownMenuSubTrigger: function DropdownMenuSubTrigger({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div role="menuitem" {...withSlot("dropdown-menu-sub-trigger", { className, ...props })}>
        {children}
      </div>
    )
  },
  DropdownMenuSubContent: makeDivMock("dropdown-menu-sub-content"),
}

// ─── input ─────────────────────────────────────────────────────────────────
// Real: base-ui Input. Mock: native <input>, type="text" by default.

export const inputMock = {
  Input: function Input({
    className,
    type = "text",
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input type={type} {...withSlot("input", { className, ...props })} />
  },
}

// ─── separator ────────────────────────────────────────────────────────────
// Real: base-ui Separator (handles orientation + decorative aria).
// Mock: <div role="separator"> with orientation forwarded as data-orientation
// so a future test can still assert orientation behavior.

export const separatorMock = {
  Separator: function Separator({
    className,
    orientation = "horizontal",
    decorative: _decorative,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "horizontal" | "vertical"
    decorative?: boolean
  }) {
    return (
      <div
        role="separator"
        data-orientation={orientation}
        {...withSlot("separator", { className, ...props })}
      />
    )
  },
}

// ─── table ─────────────────────────────────────────────────────────────────
// Real is already thin (semantic HTML + a container <div>). We mock anyway
// so the test build doesn't have to evaluate the real Tailwind class soup,
// but we keep the semantic <table>/<thead>/etc. so role queries work.

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  containerClassName?: string
}

export const tableMock = {
  Table: function Table({ className, containerClassName, children, ...props }: TableProps) {
    return (
      <div data-slot="table-container" className={containerClassName}>
        <table {...withSlot("table", { className, ...props })}>{children}</table>
      </div>
    )
  },
  TableHeader: function TableHeader({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <thead {...withSlot("table-header", { className, ...props })}>{children}</thead>
  },
  TableBody: function TableBody({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tbody {...withSlot("table-body", { className, ...props })}>{children}</tbody>
  },
  TableFooter: function TableFooter({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tfoot {...withSlot("table-footer", { className, ...props })}>{children}</tfoot>
  },
  TableHead: function TableHead({
    className,
    children,
    ...props
  }: React.ThHTMLAttributes<HTMLTableCellElement>) {
    return <th {...withSlot("table-head", { className, ...props })}>{children}</th>
  },
  TableRow: function TableRow({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLTableRowElement>) {
    return <tr {...withSlot("table-row", { className, ...props })}>{children}</tr>
  },
  TableCell: function TableCell({
    className,
    children,
    ...props
  }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return <td {...withSlot("table-cell", { className, ...props })}>{children}</td>
  },
  TableCaption: function TableCaption({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLTableCaptionElement>) {
    return <caption {...withSlot("table-caption", { className, ...props })}>{children}</caption>
  },
}

// ─── tooltip ───────────────────────────────────────────────────────────────
// Real: base-ui Tooltip (Provider/Root/Trigger/Content/Portal). Mock:
// Provider/Root/Trigger render children inline; Content renders its body so
// tests can assert tooltip text without simulating hover/focus.

export const tooltipMock = {
  TooltipProvider: makeFragmentMock(),
  Tooltip: makeFragmentMock(),
  TooltipTrigger: function TooltipTrigger({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLButtonElement>) {
    return <button {...withSlot("tooltip-trigger", { className, ...props })}>{children}</button>
  },
  TooltipContent: function TooltipContent({
    className,
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div role="tooltip" {...withSlot("tooltip-content", { className, ...props })}>
        {children}
      </div>
    )
  },
}
