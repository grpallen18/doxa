'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/admin/record/status-badge'
import type { NeoSelection } from '@/components/admin/neo/sigma-canvas'
import { cn } from '@/lib/utils'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="break-words text-sm text-zinc-100">{value}</dd>
    </div>
  )
}

export function NeoNodeDetailPanel({
  selection,
  storyId,
  onClose,
  onFocus,
  className,
}: {
  selection: NeoSelection
  storyId: string
  onClose: () => void
  onFocus: () => void
  className?: string
}) {
  const hasNode = Boolean(selection.nodeId)
  const hasEdge = Boolean(selection.edgeId)
  if (!hasNode && !hasEdge) return null

  return (
    <aside
      className={cn(
        'flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-zinc-950/90 text-zinc-100 shadow-2xl backdrop-blur-md',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">
            {hasNode ? 'Node' : 'Relationship'}
          </h2>
          {hasNode && selection.kind ? (
            <StatusBadge label={selection.kind} variant="muted" />
          ) : null}
          {hasEdge && selection.edgeType ? (
            <StatusBadge label={selection.edgeType} variant="muted" />
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          onClick={onClose}
        >
          Close
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {hasNode ? (
          <>
            <Field label="Label" value={selection.label} />
            <Field label="Id" value={selection.nodeId} />
            {selection.charStart != null && selection.charEnd != null ? (
              <Field
                label="Char span"
                value={`${selection.charStart}–${selection.charEnd}`}
              />
            ) : null}
            {selection.properties &&
              Object.entries(selection.properties).map(([key, value]) => {
                if (key === 'uid' || key === 'text' || key === 'title' || key === 'name')
                  return null
                if (value == null || value === '') return null
                return <Field key={key} label={key} value={String(value)} />
              })}
            {selection.properties?.text ? (
              <Field label="Text" value={String(selection.properties.text)} />
            ) : null}
            {selection.properties?.url ? (
              <Field
                label="URL"
                value={
                  <a
                    href={String(selection.properties.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 underline"
                  >
                    Open source
                  </a>
                }
              />
            ) : null}
          </>
        ) : (
          <>
            <Field label="Type" value={selection.edgeType} />
            <Field label="Id" value={selection.edgeId} />
            <Field label="Source" value={selection.edgeSource} />
            <Field label="Target" value={selection.edgeTarget} />
            {selection.edgeProperties &&
              Object.entries(selection.edgeProperties).map(([key, value]) => {
                if (value == null || value === '') return null
                return <Field key={key} label={key} value={String(value)} />
              })}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
        {hasNode ? (
          <Button
            type="button"
            size="sm"
            className="bg-white/15 text-zinc-100 hover:bg-white/25"
            onClick={onFocus}
          >
            Recenter
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline" className="border-white/15 bg-transparent">
          <Link href={`/admin/stories/${storyId}`}>Story hub</Link>
        </Button>
      </div>
    </aside>
  )
}
