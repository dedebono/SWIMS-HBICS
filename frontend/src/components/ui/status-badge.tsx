import * as React from "react"

import { cn } from "@/lib/utils"

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "purple"

export interface StatusBadgeProps extends React.ComponentProps<"span"> {
  tone?: StatusTone
  /** Show a leading dot — the standard treatment in minimalist tables. */
  dot?: boolean
  label: React.ReactNode
}

const badgeTones: Record<StatusTone, string> = {
  success: "bg-success-soft text-[#067647]",
  warning: "bg-warning-soft text-[#b54708]",
  danger: "bg-danger-soft text-[#b42318]",
  info: "bg-info-soft text-[#175cd3]",
  purple: "bg-[#f1ecfe] text-[#6941c6]",
  neutral: "bg-muted text-muted-foreground",
}

const dotTones: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-primary",
  purple: "bg-[#7c5cf0]",
  neutral: "bg-muted-foreground",
}

/** Pill badge with an optional status dot — used across tables and lists. */
function StatusBadge({
  className,
  tone = "neutral",
  dot = true,
  label,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        badgeTones[tone],
        className
      )}
      {...props}
    >
      {dot ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", dotTones[tone])}
          aria-hidden="true"
        />
      ) : null}
      {label}
    </span>
  )
}

/**
 * Maps a SWIMS severity / status string to a semantic tone.
 * Falls back to neutral for unknown values so the UI never breaks.
 */
export function severityTone(severity?: string | null): StatusTone {
  switch ((severity || "").toUpperCase()) {
    case "LOW":
    case "RESOLVED":
    case "CLOSED":
    case "COMPLETED":
    case "COMPLETE":
    case "DONE":
    case "ACTIVE":
    case "APPROVED":
      return "success"
    case "MEDIUM":
    case "PENDING":
    case "IN_PROGRESS":
    case "SUBMITTED":
    case "SCHEDULED":
      return "warning"
    case "HIGH":
    case "CRITICAL":
    case "REJECTED":
    case "OVERDUE":
    case "ESCALATED":
      return "danger"
    case "OPEN":
    case "NEW":
    case "DRAFT":
      return "info"
    case "BOARD_REVIEW":
    case "ESCALATED_REVIEW":
      return "purple"
    default:
      return "neutral"
  }
}

export { StatusBadge }