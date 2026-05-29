'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ExtractionStatus, StoryListItem } from '@/lib/admin/story-extraction-review'
import { qaStatusLabel } from '@/lib/admin/extraction-qa-types'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function extractionStatusLabel(status: ExtractionStatus): string {
  switch (status) {
    case 'merged':
      return 'Merged'
    case 'extracted':
      return 'Extracted'
    case 'skipped_empty':
      return 'Skipped (empty)'
    case 'pending_extraction':
      return 'Pending'
    default:
      return status
  }
}

export default function AdminStoriesPage() {
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<'recent' | 'relevant'>('recent')
  const [qaStatus, setQaStatus] = useState('')
  const [items, setItems] = useState<StoryListItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const limit = 30

  const fetchStories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        sort,
      })
      if (title.trim()) params.set('title', title.trim())
      if (source.trim()) params.set('source', source.trim())
      if (keyword.trim()) params.set('keyword', keyword.trim())
      if (qaStatus) params.set('qa_status', qaStatus)

      const res = await fetch(`/api/admin/stories/list?${params}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error?.message ?? 'Failed to load stories')
        setItems([])
        return
      }
      setItems(json.data?.items ?? [])
      setTotal(json.data?.total ?? 0)
    } catch {
      setError('Failed to load stories')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [title, source, keyword, sort, qaStatus, offset])

  useEffect(() => {
    fetchStories()
  }, [fetchStories])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setOffset(0)
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            Home
          </Link>
          <span className="text-muted">/</span>
          <Link href="/admin" className="text-sm text-muted hover:text-foreground">
            Admin
          </Link>
          <span className="text-muted">/</span>
          <span className="text-sm font-medium">Stories</span>
        </div>

        <section className="space-y-2">
          <h1 className="text-xl font-semibold">Story extraction review</h1>
          <p className="text-sm text-muted">
            Search stories and open a review view to compare article text against extracted claims,
            evidence, positions, and events.
          </p>
        </section>

        <Panel variant="soft" interactive={false} className="p-4">
          <form onSubmit={handleSearch} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Search by title"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Source</label>
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Publisher name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Keyword</label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Title, snippet, or body"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Sort</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as 'recent' | 'relevant')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="recent">Most recent</option>
                <option value="relevant">Relevance score</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">QA status</label>
              <select
                value={qaStatus}
                onChange={(e) => setQaStatus(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Any</option>
                <option value="needs_human_review">Needs human review</option>
                <option value="passed">QA passed</option>
                <option value="pending_qa">Pending QA</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Searching…' : 'Search'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTitle('')
                  setSource('')
                  setKeyword('')
                  setSort('recent')
                  setQaStatus('')
                  setOffset(0)
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        </Panel>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Panel variant="soft" interactive={false} className="overflow-hidden">
          <div className="border-b border-subtle px-4 py-2 text-xs text-muted">
            {total} stor{total === 1 ? 'y' : 'ies'}
            {loading ? ' · loading…' : ''}
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {items.length === 0 && !loading ? (
              <p className="p-6 text-sm text-muted">No stories found.</p>
            ) : (
              <ul className="divide-y divide-subtle">
                {items.map((story) => (
                  <li key={story.story_id}>
                    <Link
                      href={`/admin/stories/${story.story_id}`}
                      className="block px-4 py-3 transition-colors hover:bg-muted/30"
                    >
                      <p className="font-medium line-clamp-2">{story.title}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{story.source_name ?? 'Unknown source'}</span>
                        <span>Published {formatDate(story.published_at)}</span>
                        <span>Ingested {formatDate(story.fetched_at)}</span>
                        <span>{extractionStatusLabel(story.extraction_status)}</span>
                        <span>{qaStatusLabel(story.extraction_qa_status)}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {story.claim_count} claims · {story.evidence_count} evidence ·{' '}
                        {story.position_count} positions · {story.event_count} events
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {total > limit && (
            <div className="flex items-center justify-between border-t border-subtle px-4 py-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0 || loading}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted">
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset + limit >= total || loading}
                onClick={() => setOffset((o) => o + limit)}
              >
                Next
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </main>
  )
}
