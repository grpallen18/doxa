import { cn } from '@/lib/utils'

const variantClass: Record<string, string> = {
  default: 'border border-subtle bg-muted/50 text-foreground',
  success:
    'border border-green-600/20 bg-green-500/15 text-green-800 dark:border-green-500/25 dark:bg-green-500/15 dark:text-green-400',
  warning: 'border border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  danger:
    'border border-red-600/20 bg-red-500/15 text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-400',
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
