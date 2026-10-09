import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Card — white surface, thin #E6EAF2 border, 16px radius, very soft shadow.
 * `size="sm"` is the compact variant used in dense grids and list rows.
 */
function Card({
  className,
  size = "default",
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  interactive?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-card",
        // Default padding for cards used bare (no CardHeader/CardContent).
        // Resets to 0 when the structured sub-slots are present, since those
        // carry their own spacing — avoids double padding.
        "p-6 has-data-[slot=card-header]:p-0 has-data-[slot=card-content]:p-0 has-data-[slot=card-footer]:p-0",
        // NOTE: deliberately no `pt-0` reset for CardContent here.
        //
        // An earlier revision zeroed CardContent's top padding whenever a
        // CardHeader was present (and later narrowed that to headers drawing a
        // `border-b`). Both were wrong: the header's own bottom padding sits
        // ABOVE the separator line, so zeroing the content's padding made the
        // first control sit flush against — or hard against — the title/line.
        // Every card needs its breathing room regardless of whether the header
        // is bordered, so CardContent keeps its `pt-6` unconditionally (see
        // CardContent). Only direct children are affected either way, so a
        // nested Card keeps its own spacing.
        interactive &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-card-hover focus-within:border-primary/30 focus-within:shadow-card-hover",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header grid auto-rows-min items-start gap-1 px-6 py-5",
        "group-data-[size=sm]/card:px-5 group-data-[size=sm]/card:py-4",
        "[.border-b]:pb-4",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-semibold tracking-tight text-heading",
        "group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[0.8125rem] leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        // Card drops its own padding to 0 as soon as a card-content exists, so
        // the top padding has to live here — otherwise a CardContent rendered as
        // the FIRST child of a Card (no CardHeader above it) sits flush against
        // the top border.
        //
        // This padding is UNCONDITIONAL. It also applies when a CardHeader sits
        // above it: the header's own bottom padding is on the other side of the
        // separator line, so the content still needs its own gap below that line.
        // (An earlier revision zeroed it via a `pt-0` rule on the parent Card,
        // which made card content collide with bordered headers.)
        //
        // `twMerge` keeps any explicit pt-*/py-* passed by the call site, which
        // always wins over these defaults.
        "px-6 pt-6 pb-6",
        "group-data-[size=sm]/card:px-5 group-data-[size=sm]/card:pt-5 group-data-[size=sm]/card:pb-5",
        className
      )}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-border bg-[#fbfcfe] px-6 py-5",
        "group-data-[size=sm]/card:px-5 group-data-[size=sm]/card:py-4",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}