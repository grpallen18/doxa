import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type EntityHeaderMetaItem = {
  label: string
  value: ReactNode
}

export function EntityHeader({
  title,
  subtitle,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  meta?: EntityHeaderMetaItem[]
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'rounded-lg border border-subtle bg-card px-4 py-4 sm:px-5',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-snug sm:text-xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {meta && meta.length > 0 && (
        <dl className="mt-4 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {meta.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="font-medium text-muted">{item.label}</dt>
              <dd className="mt-0.5 break-words text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  )
}
