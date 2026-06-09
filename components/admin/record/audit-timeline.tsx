'use client'

import type { HistoryEvent } from '@/lib/admin/history'
import { formatHistoryActor, formatHistoryTimestamp } from '@/lib/admin/history'
import {
  RecordLedgerCell,
  recordLedgerHeaderClass,
  recordLedgerValueClass,
} from '@/components/admin/record/record-ledger-table'
import { cn } from '@/lib/utils'

function formatModifiedAt(iso: string): string {
  return formatHistoryTimestamp(iso)
}

const AUDIT_GRID =
  'grid grid-cols-[minmax(6.5rem,10.5rem)_minmax(0,1fr)] md:grid-cols-[minmax(6.5rem,10.5rem)_minmax(5rem,11rem)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(6.5rem,10.5rem)_minmax(5rem,11rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(4.5rem,9rem)] gap-x-4'

const AUDIT_ROW_CLASS = cn(AUDIT_GRID, 'min-w-0 items-center px-3 py-2 transition-colors hover:bg-white')

export function AuditTimeline({
  events,
  emptyMessage = 'No records',
}: {
  events: HistoryEvent[]
  emptyMessage?: string
}) {
  return (
    <div className="min-w-0 w-full rounded-md border border-subtle text-sm">
      <div className={cn(AUDIT_GRID, recordLedgerHeaderClass)}>
        <span className="min-w-0 truncate">Modified At</span>
        <span className="min-w-0 truncate">Field</span>
        <span className="hidden min-w-0 truncate md:block">Previous Value</span>
        <span className="hidden min-w-0 truncate md:block">New Value</span>
        <span className="hidden min-w-0 truncate lg:block">User</span>
      </div>
      <ol className="divide-y divide-subtle">
        {events.length === 0 ? (
          <li className={cn(AUDIT_GRID, 'px-3 py-3 text-xs text-muted')}>
            <span className="col-span-full">{emptyMessage}</span>
          </li>
        ) : null}
        {events.map((event) => (
          <li key={event.id} className={AUDIT_ROW_CLASS}>
            <time
              className="min-w-0 truncate text-xs tabular-nums text-muted"
              title={formatModifiedAt(event.at)}
            >
              {formatModifiedAt(event.at)}
            </time>
            <span className={recordLedgerValueClass} title={event.field ?? undefined}>
              <RecordLedgerCell>{event.field}</RecordLedgerCell>
            </span>
            <span className={cn(recordLedgerValueClass, 'hidden md:block')} title={event.previousValue ?? undefined}>
              <RecordLedgerCell>{event.previousValue}</RecordLedgerCell>
            </span>
            <span className={cn(recordLedgerValueClass, 'hidden md:block')} title={event.newValue ?? undefined}>
              <RecordLedgerCell>{event.newValue}</RecordLedgerCell>
            </span>
            <span
              className={cn(recordLedgerValueClass, 'hidden lg:block')}
              title={formatHistoryActor(event)}
            >
              {formatHistoryActor(event)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
