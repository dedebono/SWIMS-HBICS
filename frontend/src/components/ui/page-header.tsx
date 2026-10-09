import * as React from "react"

import { cn } from "@/lib/utils"

export interface PageHeaderProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** Big bold navy page title. */
  title: React.ReactNode
  /** Small muted explanation under the title. */
  description?: React.ReactNode
  /** Buttons / filters aligned to the right on desktop, stacked on mobile. */
  actions?: React.ReactNode
}

/** Consistent page header: bold title, muted subtitle, right-aligned actions. */
function PageHeader({
  className,
  title,
  description,
  actions,
  children,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-subtitle">{description}</p> : null}
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>
      ) : null}
    </header>
  )
}

export interface ActionLinkProps extends React.ComponentProps<"a"> {
  /** Arrow direction; defaults to right. */
  direction?: "right" | "left" | "up" | "down"
  children: React.ReactNode
}

/** Inline "Lihat semua →" style link whose arrow slides on hover. */
function ActionLink({
  className,
  direction = "right",
  children,
  ...props
}: ActionLinkProps) {
  const rotation = {
    right: "",
    left: "rotate-180",
    up: "-rotate-90",
    down: "rotate-90",
  }[direction]

  return (
    <a data-slot="action-link" className={cn("action-link", className)} {...props}>
      {children}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("size-3.5 transition-transform", rotation)}
        aria-hidden="true"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </a>
  )
}

export interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

/** Friendly empty state with a pastel icon tile. */
function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3.5 px-8 py-16 text-center",
        className
      )}
      {...props}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-xl bg-[#eef3fb] text-[#5b6b8c]">
          <span className="[&_svg:not([class*='size-'])]:size-6">{icon}</span>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-heading text-sm font-semibold text-heading">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export { PageHeader, ActionLink, EmptyState }