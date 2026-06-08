import { cn } from '@/lib/utils'

const variantClass: Record<string, string> = {
  default: 'border border-subtle bg-muted/50 text-foreground',
  success:
    'border border-[var(--pipeline-step-complete-bg)]/30 bg-[var(--pipeline-step-complete-bg)]/12 text-[var(--pipeline-step-complete-fg)]',
  warning: 'border border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  danger: 'border border-destructive/25 bg-destructive/10 text-destructive',
  muted: 'border border-subtle bg-muted/30 text-muted-foreground',
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
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClass[variant] ?? variantClass.default,
        className
      )}
    >
      {label}
    </span>
  )
}
