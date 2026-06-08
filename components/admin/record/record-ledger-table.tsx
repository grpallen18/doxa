import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function RecordLedgerCell({ children }: { children: ReactNode }) {
  if (children == null || children === '') {
    return <span className="text-muted/60">—</span>
  }
  return <>{children}</>
}

export function RecordLedgerTable({
  columns,
  gridClass,
  children,
}: {
  columns: string[]
  gridClass: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0 w-full rounded-md border border-subtle text-sm">
      <div
        className={cn(
          gridClass,
          'border-b border-[var(--record-section-header-border)] bg-[var(--record-section-header-bg)] px-3 py-2 text-xs font-medium text-[var(--record-section-header-fg)]'
        )}
      >
        {columns.map((column) => (
          <span key={column} className="min-w-0 truncate">
            {column}
          </span>
        ))}
      </div>
      {children}
    </div>
  )
}

export const recordLedgerRowClass = (gridClass: string) =>
  cn(gridClass, 'min-w-0 items-center px-3 py-2 transition-colors hover:bg-white')

export const recordLedgerValueClass = 'min-w-0 truncate text-xs leading-snug text-muted'
