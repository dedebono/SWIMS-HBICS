import * as React from "react"

import { cn } from "@/lib/utils"

export type TrendDirection = "up" | "down" | "flat"

export interface StatCardProps extends React.ComponentProps<"div"> {
  /** Short caption above the number. */
  label: string
  /** The big numeral. Pass a string when the value is still loading. */
  value: React.ReactNode
  /** Small helper text under the number. */
  hint?: string
  /** Semantic direction: green = good, red = bad, grey = neutral. */
  trend?: TrendDirection
  /** Optional "+12%" style caption rendered next to the trend arrow. */
  trendLabel?: string
  /** Icon rendered inside a pastel box. */
  icon?: React.ReactNode
  iconTone?: "blue" | "green" | "red" | "yellow" | "purple" | "teal" | "pink" | "slate"
  /** Optional pill progress rendered below the hint. */
  progress?: number
  /** Accessible label for the progress bar. */
  progressLabel?: string
}

const trendClasses: Record<TrendDirection, string> = {
  up: "text-[#067647]",
  down: "text-[#b42318]",
  flat: "text-muted-foreground",
}

/**
 * Statistic card — pastel icon tile, oversized navy numeral, semantic trend,
 * optional pill progress bar. The workhorse of every dashboard header row.
 */
function StatCard({
  className,
  label,
  value,
  hint,
  trend,
  trendLabel,
  icon,
  iconTone = "blue",
  progress,
  progressLabel,
  ...props
}: StatCardProps) {
  const showTrend = trend !== undefined && trend !== "flat"

  return (
    <div
      data-slot="stat-card"
      className={cn(
        "flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-6 shadow-card",
        "transition-all duration-200 hover:shadow-card-hover",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="card-label">{label}</p>
        {icon ? <IconTile tone={iconTone}>{icon}</IconTile> : null}
      </div>

      <div className="flex items-end gap-2.5">
        <span className="stat-value">{value}</span>
        {showTrend ? (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 text-xs font-semibold",
              trendClasses[trend]
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn("size-3.5", trend === "down" && "rotate-180")}
              aria-hidden="true"
            >
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
            {trendLabel}
          </span>
        ) : trend === "flat" && trendLabel ? (
          <span className="mb-1 text-xs font-medium text-muted-foreground">{trendLabel}</span>
        ) : null}
      </div>

      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}

      {typeof progress === "number" ? (
        <ProgressPill
          value={progress}
          label={progressLabel}
          className="mt-auto pt-1"
        />
      ) : null}
    </div>
  )
}

// ── Inline helpers ───────────────────────────────────────────────────────────

const tileTones = {
  blue: "bg-[#e8f2fe] text-primary",
  green: "bg-[#e6f8f0] text-[#067647]",
  red: "bg-[#fdecec] text-[#d92d20]",
  yellow: "bg-[#fef4e4] text-[#b54708]",
  purple: "bg-[#f1ecfe] text-[#6941c6]",
  teal: "bg-[#e2f7f8] text-[#0e7c8a]",
  pink: "bg-[#fdeaf1] text-[#c11574]",
  slate: "bg-[#eef1f7] text-[#475467]",
} as const

function IconTile({
  tone = "blue",
  className,
  children,
}: {
  tone?: keyof typeof tileTones
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-[10px]",
        tileTones[tone],
        "[&_svg:not([class*='size-'])]:size-5",
        className
      )}
    >
      {children}
    </div>
  )
}

export interface ProgressPillProps extends React.ComponentProps<"div"> {
  /** 0–100 */
  value: number
  label?: string
  tone?: "blue" | "green" | "yellow" | "red" | "purple"
}

const progressTones = {
  blue: "bg-primary",
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
  purple: "bg-[#7c5cf0]",
} as const

/** Fully-rounded progress track with an accessible value. */
function ProgressPill({
  className,
  value,
  label,
  tone = "blue",
  ...props
}: ProgressPillProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      data-slot="progress-pill"
      className={cn("w-full", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Kemajuan"}
      {...props}
    >
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eaeff8]">
        <div
          className={cn("h-full rounded-full transition-all duration-500", progressTones[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

export { StatCard, ProgressPill }