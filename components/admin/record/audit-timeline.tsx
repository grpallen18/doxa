'use client'

import type { HistoryEvent } from '@/lib/admin/history'
import { formatHistoryActor, formatHistoryTimestamp } from '@/lib/admin/history'
import {
  RecordLedgerCell,
  recordLedgerHeaderClass,
} from '@/components/admin/record/record-ledger-table'
import { cn } from '@/lib/utils'

const HEADER_CELL_CLASS = cn(
  recordLedgerHeaderClass,
  'whitespace-nowrap px-3 py-2 text-left align-middle font-medium first:rounded-tl-md last:rounded-tr-md'
)

const VALUE_CELL_CLASS =
  'whitespace-nowrap px-3 py-2 align-middle text-xs leading-snug text-muted'

export function AuditTimeline({
  events,
  emptyMessage = 'No records',
}: {
  events: HistoryEvent[]
  emptyMessage?: string
}) {
  return (
    <div className="min-w-0 w-full overflow-x-auto rounded-md border border-subtle text-sm">
      <table className="w-max min-w-full table-auto border-collapse">
        <thead>
          <tr className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
            <th className={HEADER_CELL_CLASS}>Modified At</th>
            <th className={HEADER_CELL_CLASS}>Field</th>
            <th className={HEADER_CELL_CLASS}>Previous Value</th>
            <th className={HEADER_CELL_CLASS}>Current Value</th>
            <th className={HEADER_CELL_CLASS}>User</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {events.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-3 text-xs text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
          {events.map((event) => (
            <tr
              key={event.id}
              className="transition-colors hover:bg-white"
            >
              <td
                className={cn(VALUE_CELL_CLASS, 'tabular-nums')}
                title={formatHistoryTimestamp(event.at)}
              >
                <time dateTime={event.at}>{formatHistoryTimestamp(event.at)}</time>
              </td>
              <td className={VALUE_CELL_CLASS} title={event.field ?? undefined}>
                <RecordLedgerCell>{event.field}</RecordLedgerCell>
              </td>
              <td className={VALUE_CELL_CLASS} title={event.previousValue ?? undefined}>
                <RecordLedgerCell>{event.previousValue}</RecordLedgerCell>
              </td>
              <td className={VALUE_CELL_CLASS} title={event.newValue ?? undefined}>
                <RecordLedgerCell>{event.newValue}</RecordLedgerCell>
              </td>
              <td className={VALUE_CELL_CLASS} title={formatHistoryActor(event)}>
                {formatHistoryActor(event)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
