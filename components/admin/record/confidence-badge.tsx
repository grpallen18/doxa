import { cn } from '@/lib/utils'

export function ConfidenceBadge({
  value,
  className,
}: {
  value: number | null | undefined
  className?: string
}) {
  if (value == null || Number.isNaN(value)) return null
  const pct = Math.round(value * 100)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
        className
      )}
    >
      {pct}% conf.
    </span>
  )
}
