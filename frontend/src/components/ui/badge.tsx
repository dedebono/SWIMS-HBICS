import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** Pill badges — 999px radius, semibold small text, soft tinted backgrounds. */
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25 [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-card text-secondary-text",
        soft: "border-transparent bg-accent text-primary",
        success: "border-transparent bg-success-soft text-[#067647]",
        warning: "border-transparent bg-warning-soft text-[#b54708]",
        danger: "border-transparent bg-danger-soft text-[#b42318]",
        destructive: "border-transparent bg-danger-soft text-[#b42318]",
        info: "border-transparent bg-info-soft text-[#175cd3]",
        muted: "border-transparent bg-muted text-muted-foreground",
        ghost: "border-transparent text-muted-foreground hover:bg-muted",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }