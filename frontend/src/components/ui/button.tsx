import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Buttons — 10px radius, medium-weight Inter labels, soft shadows on the
 * primary variant. `default` is the solid primary CTA, `outline` the
 * secondary action.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary-strong text-primary-foreground shadow-button hover:bg-primary-strong-hover hover:shadow-card-hover",
        outline:
          "border-border bg-card text-heading shadow-card hover:border-primary/30 hover:bg-primary-softer hover:text-primary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[#e4ecf9]",
        ghost:
          "text-secondary-text hover:bg-accent hover:text-heading",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground",
        "destructive-solid": "bg-destructive text-destructive-foreground shadow-button hover:brightness-95",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-4",
        xs: "h-7 gap-1 rounded-lg px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-[9px] px-3 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-4",
        lg: "h-11 gap-2 rounded-xl px-6 text-[0.9375rem] [&_svg:not([class*='size-'])]:size-[1.125rem]",
        icon: "size-9",
        "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-[9px]",
        "icon-lg": "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }