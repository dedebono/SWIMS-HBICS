import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Minimalist table primitives. Wrappers are unstyled so callers keep full
 * control of columns; the shared classes give the house table look —
 * uppercase micro-headers, hairline row dividers, generous row padding.
 */

export interface DataTableProps extends React.ComponentProps<"table"> {
  /** Wrap in a horizontally scrollable region (default true). */
  scroll?: boolean
}

function DataTable({ className, scroll = true, children, ...props }: DataTableProps) {
  const table = (
    <table data-slot="data-table" className={cn("swims-table", className)} {...props}>
      {children}
    </table>
  )

  if (!scroll) return table

  return (
    <div className="scroll-slim -mx-6 overflow-x-auto px-6 py-1">
      {table}
    </div>
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-head" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableRow({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        interactive && "cursor-pointer transition-colors hover:bg-primary-softer",
        className
      )}
      {...props}
    />
  )
}

function TableHeaderCell({ className, ...props }: React.ComponentProps<"th">) {
  return <th data-slot="table-th" className={cn(className)} {...props} />
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-td" className={cn(className)} {...props} />
}

function TableEmptyRow({
  colSpan,
  children,
}: {
  colSpan: number
  children: React.ReactNode
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center">
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <span className="text-sm font-medium text-heading">{children}</span>
        </div>
      </td>
    </tr>
  )
}

export {
  DataTable,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableEmptyRow,
}