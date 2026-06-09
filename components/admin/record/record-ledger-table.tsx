import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type RecordLedgerTab = {
  id: string
  label: string
}

export const recordLedgerHeaderClass =
  'border-b border-sidebar-border bg-sidebar px-3 py-2 text-xs font-medium text-sidebar-foreground'

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
  tabs,
  activeTab,
  onTabChange,
}: {
  columns: string[]
  gridClass: string
  children: ReactNode
  tabs?: RecordLedgerTab[]
  activeTab?: string
  onTabChange?: (tabId: string) => void
}) {
  return (
    <div className="min-w-0 w-full rounded-md border border-subtle text-sm">
      {tabs && tabs.length > 0 && onTabChange && (
        <div className="flex gap-1 border-b border-subtle px-2 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors',
                activeTab === tab.id
                  ? 'bg-surface-soft text-foreground'
                  : 'text-muted hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div
        className={cn(gridClass, recordLedgerHeaderClass)}
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
