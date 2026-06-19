'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

type TabIndicator = {
  left: number
  width: number
}

function RecordLedgerTabBar({
  tabs,
  activeTab,
  onTabChange,
  variant,
}: {
  tabs: RecordLedgerTab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  variant: 'lane' | 'status'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [indicator, setIndicator] = useState<TabIndicator>({ left: 0, width: 0 })

  const updateIndicator = () => {
    const container = containerRef.current
    const activeEl = tabRefs.current.get(activeTab)
    if (!container || !activeEl) return

    const containerRect = container.getBoundingClientRect()
    const tabRect = activeEl.getBoundingClientRect()
    setIndicator({
      left: tabRect.left - containerRect.left,
      width: tabRect.width,
    })
  }

  useLayoutEffect(() => {
    updateIndicator()
  }, [activeTab, tabs])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      updateIndicator()
    })
    observer.observe(container)
    window.addEventListener('resize', updateIndicator)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateIndicator)
    }
  }, [activeTab, tabs])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex gap-1 border-b border-subtle px-2 pb-0 pt-2',
        variant === 'lane' && 'bg-surface-section'
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-accent-secondary transition-[left,width] duration-200 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-pressed={isActive}
            ref={(element) => {
              if (element) tabRefs.current.set(tab.id, element)
              else tabRefs.current.delete(tab.id)
            }}
            className={cn(
              'relative z-[1] whitespace-nowrap rounded-t-md px-2.5 py-1 transition-colors',
              variant === 'lane'
                ? 'text-xs font-medium'
                : 'text-[11px] font-medium uppercase tracking-wide',
              isActive ? 'text-foreground' : 'text-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export function RecordLedgerTable({
  columns,
  gridClass,
  children,
  tabs,
  activeTab,
  onTabChange,
  laneTabs,
  activeLaneTab,
  onLaneTabChange,
  showColumns = true,
}: {
  columns: string[]
  gridClass: string
  children: ReactNode
  tabs?: RecordLedgerTab[]
  activeTab?: string
  onTabChange?: (tabId: string) => void
  laneTabs?: RecordLedgerTab[]
  activeLaneTab?: string
  onLaneTabChange?: (tabId: string) => void
  showColumns?: boolean
}) {
  return (
    <div className="min-w-0 w-full rounded-md border border-subtle text-sm">
      {laneTabs && laneTabs.length > 0 && onLaneTabChange && activeLaneTab != null && (
        <RecordLedgerTabBar
          tabs={laneTabs}
          activeTab={activeLaneTab}
          onTabChange={onLaneTabChange}
          variant="lane"
        />
      )}
      {tabs && tabs.length > 0 && onTabChange && activeTab != null && (
        <RecordLedgerTabBar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          variant="status"
        />
      )}
      {showColumns ? (
        <div className={cn(gridClass, recordLedgerHeaderClass)}>
          {columns.map((column) => (
            <span key={column} className="min-w-0 truncate">
              {column}
            </span>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  )
}

export const recordLedgerRowClass = (gridClass: string) =>
  cn(gridClass, 'min-w-0 items-center px-3 py-2 transition-colors hover:bg-white')

export const recordLedgerValueClass = 'min-w-0 truncate text-xs leading-snug text-muted'
