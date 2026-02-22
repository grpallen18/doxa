import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-skeleton-pulse rounded-md bg-neutral-400/60 dark:bg-neutral-600",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
