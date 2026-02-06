import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

type ItemElement = HTMLDivElement | HTMLAnchorElement

export interface ItemProps
  extends Omit<React.HTMLAttributes<ItemElement>, "as"> {
  asChild?: boolean
  variant?: "default" | "outline"
}

const Item = React.forwardRef<ItemElement, ItemProps>(
  ({ className, asChild = false, variant = "default", ...props }, ref) => {
    const Comp = asChild ? Slot : "div"
    const base =
      "panel-bevel-soft panel-bevel-interactive rounded-bevel flex w-full items-center gap-3 p-4 [transition:background-color_var(--interactive-duration)_ease,box-shadow_var(--interactive-duration)_ease,transform_var(--interactive-duration)_ease] hover:shadow-panel-hover"
    const variantClass =
      variant === "outline"
        ? "border border-subtle"
        : ""
    return (
      <Comp
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(base, variantClass, className)}
        {...props}
      />
    )
  }
)
Item.displayName = "Item"

const ItemContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("min-w-0 flex-1", className)}
    {...props}
  />
))
ItemContent.displayName = "ItemContent"

const ItemTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm font-medium text-foreground", className)}
    {...props}
  />
))
ItemTitle.displayName = "ItemTitle"

const ItemDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("mt-0.5 text-xs text-muted-foreground", className)}
    {...props}
  />
))
ItemDescription.displayName = "ItemDescription"

const ItemActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("shrink-0 [&_svg]:size-4", className)}
    {...props}
  />
))
ItemActions.displayName = "ItemActions"

export { Item, ItemContent, ItemTitle, ItemDescription, ItemActions }
