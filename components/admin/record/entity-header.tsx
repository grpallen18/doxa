import type { ReactNode } from 'react'
import { EntityHeaderIcon } from '@/components/admin/record/entity-header-icon'
import type { EntityRecordKind } from '@/lib/admin/entity-record-icons'
import { cn } from '@/lib/utils'

function EntityHeaderTitle({
  title,
  entityType,
  className,
  iconSize = 'md',
}: {
  title: ReactNode
  entityType?: EntityRecordKind
  className?: string
  iconSize?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {entityType ? <EntityHeaderIcon kind={entityType} size={iconSize} /> : null}
      <h1 className={cn('min-w-0 flex-1 text-[var(--record-section-header-fg)]', className)}>
        {title}
      </h1>
    </div>
  )
}

export type EntityHeaderMetaItem = {
  label: string
  value: ReactNode
}

export function EntityHeader({
  title,
  subtitle,
  meta,
  statusBadges,
  actions,
  destructiveActions,
  layout = 'default',
  embedded = false,
  entityType,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  meta?: EntityHeaderMetaItem[]
  statusBadges?: ReactNode
  actions?: ReactNode
  destructiveActions?: ReactNode
  layout?: 'default' | 'record'
  embedded?: boolean
  entityType?: EntityRecordKind
  className?: string
}) {
  if (layout === 'record') {
    return (
      <header
        className={cn(
          embedded
            ? 'px-4 py-3 sm:px-5'
            : 'rounded-lg border border-subtle bg-card px-4 py-3 sm:px-5',
          className
        )}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6">
          <div className="min-w-0">
            <EntityHeaderTitle
              title={title}
              entityType={entityType}
              className="text-base font-semibold leading-snug sm:text-lg"
            />
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
            {meta && meta.length > 0 && (
              <dl className="mt-2.5 flex flex-nowrap items-baseline gap-x-6 overflow-x-auto text-sm">
                {meta.map((item) => (
                  <div key={item.label} className="flex shrink-0 items-baseline gap-1.5">
                    <dt className="shrink-0 text-xs font-medium text-muted">{item.label}</dt>
                    <dd className="min-w-0 whitespace-nowrap text-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="flex flex-col items-start gap-2.5 lg:items-end">
            {statusBadges && (
              <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                {statusBadges}
              </div>
            )}
            {(actions || destructiveActions) && (
              <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
                {actions && (
                  <div className="flex flex-wrap items-center gap-2">{actions}</div>
                )}
                {destructiveActions && (
                  <div
                    className={cn(
                      'flex flex-wrap items-center gap-2',
                      actions && 'border-t border-subtle pt-2 lg:justify-end'
                    )}
                  >
                    {destructiveActions}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header
      className={cn(
        'rounded-lg border border-subtle bg-card px-4 py-4 sm:px-5',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <EntityHeaderTitle
            title={title}
            entityType={entityType}
            iconSize="lg"
            className="text-lg font-semibold leading-snug sm:text-xl"
          />
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
