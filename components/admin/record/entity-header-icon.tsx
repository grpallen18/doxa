import type { EntityRecordKind } from '@/lib/admin/entity-record-icons'
import { ENTITY_RECORD_ICONS, ENTITY_RECORD_ICON_LABELS } from '@/lib/admin/entity-record-icons'
import { cn } from '@/lib/utils'

export function EntityHeaderIcon({
  kind,
  size = 'md',
  className,
}: {
  kind: EntityRecordKind
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const Icon = ENTITY_RECORD_ICONS[kind]
  const label = ENTITY_RECORD_ICON_LABELS[kind]

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--record-section-header-border)] bg-[var(--record-section-header-bg)] text-[var(--record-section-header-fg)]',
        size === 'sm' && 'size-8',
        size === 'md' && 'size-9',
        size === 'lg' && 'size-11',
        className
      )}
      title={label}
    >
      <Icon
        className={cn(
          size === 'sm' && 'size-4',
          size === 'md' && 'size-4',
          size === 'lg' && 'size-5'
        )}
      />
    </span>
  )
}
