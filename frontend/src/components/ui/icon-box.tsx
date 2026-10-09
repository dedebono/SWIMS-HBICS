import * as React from "react"

import { cn } from "@/lib/utils"

/** Pastel tint options for icon boxes — soft background + matching stroke. */
export type IconTone =
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "purple"
  | "teal"
  | "pink"
  | "slate"

const toneClasses: Record<IconTone, string> = {
  blue: "bg-[#e8f2fe] text-primary",
  green: "bg-[#e6f8f0] text-[#067647]",
  red: "bg-[#fdecec] text-[#d92d20]",
  yellow: "bg-[#fef4e4] text-[#b54708]",
  purple: "bg-[#f1ecfe] text-[#6941c6]",
  teal: "bg-[#e2f7f8] text-[#0e7c8a]",
  pink: "bg-[#fdeaf1] text-[#c11574]",
  slate: "bg-[#eef1f7] text-[#475467]",
}

const toneSizes = {
  sm: "size-8 rounded-lg",
  md: "size-10 rounded-[10px]",
  lg: "size-12 rounded-xl",
} as const

export interface IconBoxProps extends React.ComponentProps<"div"> {
  tone?: IconTone
  size?: keyof typeof toneSizes
}

/** Rounded pastel tile holding an outline icon. */
function IconBox({
  className,
  tone = "blue",
  size = "md",
  children,
  ...props
}: IconBoxProps) {
  return (
    <div
      data-slot="icon-box"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        toneClasses[tone],
        toneSizes[size],
        "[&_svg:not([class*='size-'])]:size-[1.15em]",
        "[&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { IconBox, toneClasses }