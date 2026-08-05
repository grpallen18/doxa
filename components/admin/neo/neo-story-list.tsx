'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/admin/record/status-badge'
import {
  formatNeoDate,
  graphStatusBadgeVariant,
  type NeoStoryListItem,
} from '@/lib/admin/neo-types'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'quarantined', label: 'Quarantined' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
] as const

export function NeoStoryList() {
  const [items, setItems] = useState<NeoStoryListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 25

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })
      if (title) params.set('title', title)
      if (status) params.set('status', status)
      const res = await fetch(`/api/admin/neo/stories?${params}`)
      const json = await res.json()
      if (!res.ok || json.error) {
        setItems([])
        setTotal(0)
        setError(json?.error?.message ?? 'Failed to load Neo stories')
        return
      }
      setItems(json.data?.items ?? [])
      setTotal(json.data?.total ?? 0)
    } catch {
      setItems([])
      setTotal(0)
      setError('Failed to load Neo stories')
    } finally {
      setLoading(false)
    }
  }, [limit, offset, status, title])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const page = Math.floor(offset / limit) + 1
  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <section aria-labelledby="neo-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 id="neo-heading" className="text-xl font-semibold tracking-tight">
            Neo
          </h1>
          <p className="mt-1 text-sm text-muted">
            Read-only discourse graphs from Neo4j — story-scoped utterances and provenance.
            View all stories in a{' '}
            <Link href="/admin/neo/union" className="underline hover:text-foreground">
              story union
            </Link>
            , or open a{' '}
            <Link href="/admin/graph-controversies" className="underline hover:text-foreground">
              graph controversy
            </Link>{' '}
            hub.
          </p>
        </div>
        <div className="flex w-full max-w-lg flex-col gap-2 sm:items-end">
          <Button asChild size="sm" variant="outline" className="h-9 shrink-0">
            <Link href="/admin/neo/union">Story union</Link>
          </Button>
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setOffset(0)
              setTitle(titleDraft.trim())
            }}
          >
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Search title…"
              className="h-9"
            />
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value || 'all'}
            size="sm"
            variant={status === f.value ? 'default' : 'outline'}
            onClick={() => {
              setStatus(f.value)
              setOffset(0)
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <Panel variant="soft" interactive={false} className="p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </Panel>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No graphed stories yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const status = item.graph_status
            const canOpenWorkspace =
              status === 'succeeded' ||
              status === 'failed' ||
              status === 'quarantined' ||
              status === 'pending' ||
              status === 'running'
            const workspaceHref = `/admin/neo/${item.story_id}`
            return (
              <li key={item.story_id}>
                <Panel variant="soft" interactive={false} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={item.graph_status ?? 'unknown'}
                          variant={graphStatusBadgeVariant(item.graph_status)}
                        />
                        {item.job_schema_version && (
                          <span className="font-mono text-[10px] text-muted">
                            schema {item.job_schema_version}
                          </span>
                        )}
                        {item.source_name && (
                          <span className="text-xs text-muted">{item.source_name}</span>
                        )}
                        <span className="text-xs text-muted">
                          {formatNeoDate(item.job_finished_at ?? item.published_at)}
                        </span>
                      </div>
                      <Link
                        href={canOpenWorkspace ? workspaceHref : `/admin/stories/${item.story_id}`}
                        className="block text-sm font-medium text-foreground hover:underline line-clamp-2"
                      >
                        {item.title || 'Untitled story'}
                      </Link>
                      {item.job_error && (
                        <p className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-wrap break-words">
                          {item.job_error}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canOpenWorkspace && (
                        <Button asChild size="sm">
                          <Link href={workspaceHref}>
                            {status === 'succeeded' ? 'Open graph' : 'Open workspace'}
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/stories/${item.story_id}`}>Story</Link>
                      </Button>
                    </div>
                  </div>
                </Panel>
              </li>
            )
          })}
        </ul>
      )}

      {total > limit && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted">
            Page {page} of {pageCount} · {total} stories
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset <= 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
