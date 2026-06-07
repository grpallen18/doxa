'use client'

import type { StoryAuditEvent } from '@/lib/admin/story-audit'

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function AuditTimeline({ events }: { events: StoryAuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-muted">
        No audit events found from current pipeline and status data.
      </p>
    )
  }

  return (
    <ol className="space-y-3 text-sm">
      {events.map((event) => (
        <li
          key={event.id}
          className="rounded-md border border-subtle px-3 py-2"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{event.label}</span>
            <time className="text-xs text-muted">{formatWhen(event.at)}</time>
          </div>
          {event.detail && <p className="mt-1 text-xs text-muted">{event.detail}</p>}
          {event.meta && (
            <p className="mt-1 font-mono text-[10px] text-muted">{event.meta}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
