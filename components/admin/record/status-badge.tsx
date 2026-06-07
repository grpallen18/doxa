import { cn } from '@/lib/utils'

const variantClass: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-[var(--pipeline-step-complete-bg)] text-[var(--pipeline-step-complete-fg)]',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  danger: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted/60 text-muted',
}

export function StatusBadge({
  label,
  variant = 'default',
  className,
}: {
  label: string
  variant?: keyof typeof variantClass
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        variantClass[variant] ?? variantClass.default,
        className
      )}
    >
      {label}
    </span>
  )
}
