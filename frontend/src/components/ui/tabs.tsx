"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-5", className)} {...props} />;
}

/**
 * `line` is the app default: pill-free, transparent, with an animated
 * underline on the active tab. `pill` is the compact filled control.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-horizontal/tabs:h-11 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        line: "gap-1 border-b border-border bg-transparent",
        pill: "gap-1 rounded-full bg-muted p-1",
      },
    },
    defaultVariants: {
      variant: "line",
    },
  }
)

function TabsList({
  className,
  variant = "line",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        tabsListVariants({ variant }),
        "scroll-slim w-full overflow-x-auto sm:w-fit",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "group/tab relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-transparent px-4 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-heading focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:text-primary",
        "group-data-[variant=pill]/tabs-list:data-active:border-border group-data-[variant=pill]/tabs-list:data-active:bg-card group-data-[variant=pill]/tabs-list:data-active:text-primary group-data-[variant=pill]/tabs-list:data-active:shadow-card",
        "after:absolute after:bg-primary after:opacity-0 after:transition-all after:duration-200 group-data-horizontal/tabs:after:inset-x-2 after:bottom-[-1px] after:h-0.5 after:rounded-full group-data-vertical/tabs:after:inset-y-1 after:-right-px after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }