'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NeoPassagePanel } from '@/components/admin/neo/neo-passage-panel'
import type { UtteranceHighlight } from '@/components/admin/neo/projection-explorer'
import {
  DEFAULT_NEO_FILTERS,
  type DoxaGraphProjection,
} from '@/lib/admin/neo-graph/types'
import {
  parseUnionStoryIds,
  UNION_MAX_STORIES,
} from '@/lib/admin/neo-graph/project-union'
import type { NeoStoryListItem } from '@/lib/admin/neo-types'
import { cn } from '@/lib/utils'

const NeoProjectionExplorer = dynamic(
  () =>
    import('@/components/admin/neo/projection-explorer').then(
      (m) => m.NeoProjectionExplorer
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#121212] text-sm text-zinc-400">
        Loading union explorer…
      </div>
    ),
  }
)

type PassagePayload = {
  story_id: string
  title: string | null
  graph_status: string | null
  url: string | null
  content_clean: string
}

type UnionDocMeta = {
  uid: string
  title: string | null
  found: boolean
  utteranceCount: number
  agentCount: number
}

type UnionApiData = {
  projection: DoxaGraphProjection
  documents: UnionDocMeta[]
  missingIds: string[]
  caps: { maxStories: number }
}

function idsToParam(ids: string[]): string {
  return ids.join(',')
}

export function NeoUnionWorkspace() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const storyIds = useMemo(
    () => parseUnionStoryIds(searchParams.get('ids')),
    [searchParams]
  )

  const [projection, setProjection] = useState<DoxaGraphProjection | null>(null)
  const [documents, setDocuments] = useState<UnionDocMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeDocUid, setActiveDocUid] = useState<string | null>(null)
  const [passage, setPassage] = useState<PassagePayload | null>(null)
  const [passageOpen, setPassageOpen] = useState(true)
  const [highlight, setHighlight] = useState<{ start: number; end: number } | null>(
    null
  )

  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<NeoStoryListItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const setStoryIds = useCallback(
    (next: string[]) => {
      const capped = next.slice(0, UNION_MAX_STORIES)
      const params = new URLSearchParams(searchParams.toString())
      if (capped.length === 0) params.delete('ids')
      else params.set('ids', idsToParam(capped))
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const addStory = useCallback(
    (id: string, title?: string | null) => {
      if (storyIds.includes(id)) return
      if (storyIds.length >= UNION_MAX_STORIES) return
      setStoryIds([...storyIds, id])
      if (title) {
        setDocuments((prev) =>
          prev.some((d) => d.uid === id)
            ? prev
            : [
                ...prev,
                {
                  uid: id,
                  title: title ?? null,
                  found: true,
                  utteranceCount: 0,
                  agentCount: 0,
                },
              ]
        )
      }
    },
    [setStoryIds, storyIds]
  )

  const removeStory = useCallback(
    (id: string) => {
      setStoryIds(storyIds.filter((x) => x !== id))
      if (activeDocUid === id) {
        setActiveDocUid(null)
        setHighlight(null)
      }
    },
    [activeDocUid, setStoryIds, storyIds]
  )

  const loadUnion = useCallback(async () => {
    if (storyIds.length === 0) {
      setProjection(null)
      setDocuments([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/neo/union', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyIds }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setProjection(null)
        setDocuments([])
        setError(json?.error?.message ?? 'Failed to load union graph')
        return
      }
      const data = json.data as UnionApiData
      setProjection(data.projection)
      setDocuments(data.documents)
      setActiveDocUid((prev) => {
        if (prev && data.documents.some((d) => d.uid === prev && d.found)) {
          return prev
        }
        return data.documents.find((d) => d.found)?.uid ?? null
      })
      if (data.missingIds.length > 0) {
        setError(
          `Missing in Neo4j: ${data.missingIds.map((id) => id.slice(0, 8)).join(', ')}…`
        )
      }
    } catch {
      setProjection(null)
      setError('Failed to load union graph')
    } finally {
      setLoading(false)
    }
  }, [storyIds])

  useEffect(() => {
    void loadUnion()
  }, [loadUnion])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        setSearchLoading(true)
        try {
          const params = new URLSearchParams({
            limit: '12',
            offset: '0',
            title: searchQuery.trim(),
            status: 'succeeded',
          })
          const res = await fetch(`/api/admin/neo/stories?${params}`)
          const json = await res.json()
          if (cancelled) return
          if (!res.ok || json.error) {
            setSearchHits([])
            return
          }
          setSearchHits((json.data?.items as NeoStoryListItem[]) ?? [])
        } catch {
          if (!cancelled) setSearchHits([])
        } finally {
          if (!cancelled) setSearchLoading(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [searchQuery])

  const loadPassage = useCallback(async (documentUid: string) => {
    try {
      const res = await fetch(
        `/api/admin/neo/documents/${encodeURIComponent(documentUid)}/passage`
      )
      const json = await res.json()
      if (!res.ok || json.error) {
        setPassage(null)
        return
      }
      setPassage(json.data as PassagePayload)
    } catch {
      setPassage(null)
    }
  }, [])

  useEffect(() => {
    if (!activeDocUid) {
      setPassage(null)
      return
    }
    void loadPassage(activeDocUid)
  }, [activeDocUid, loadPassage])

  const onUtteranceHighlight = useCallback(
    (span: UtteranceHighlight | null) => {
      if (!span) {
        setHighlight(null)
        return
      }
      if (span.documentUid && span.documentUid !== activeDocUid) {
        setActiveDocUid(span.documentUid)
      }
      setHighlight({ start: span.start, end: span.end })
    },
    [activeDocUid]
  )

  const activeDoc = documents.find((d) => d.uid === activeDocUid) ?? null
  const atCap = storyIds.length >= UNION_MAX_STORIES

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0f0f0f]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/80 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Link href="/admin/neo" className="hover:text-zinc-300 hover:underline">
              Neo
            </Link>
            <span aria-hidden>/</span>
            <span>union</span>
          </div>
          <h1 className="mt-0.5 truncate text-base font-semibold tracking-tight text-zinc-100">
            Story union
          </h1>
          <p className="mt-1 text-[11px] text-zinc-500">
            Manually compose up to {UNION_MAX_STORIES} story graphs. Shared publications and
            office entities collapse; agents with the same normalized name collapse for display
            only (Aura ids stay document-scoped).
            {projection
              ? ` · ${projection.nodes.length} nodes · ${projection.edges.length} edges`
              : ''}
          </p>
          {error ? <p className="mt-1 text-[11px] text-amber-300/90">{error}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
            onClick={() => setPassageOpen((v) => !v)}
            disabled={storyIds.length === 0}
          >
            {passageOpen ? 'Hide passage' : 'Show passage'}
          </Button>
          {activeDocUid ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
            >
              <Link href={`/admin/neo/${encodeURIComponent(activeDocUid)}`}>
                Open story Neo
              </Link>
            </Button>
          ) : null}
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
          >
            <Link href="/admin/neo">All Neo</Link>
          </Button>
        </div>
      </header>

      <div className="shrink-0 border-b border-white/10 bg-zinc-950/60 px-4 py-3 sm:px-6">
        <form
          className="flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSearchQuery(searchDraft.trim())
          }}
        >
          <Input
            value={searchDraft}
            onChange={(e) => {
              setSearchDraft(e.target.value)
              setSearchQuery(e.target.value.trim())
            }}
            placeholder="Search succeeded stories to add…"
            className="h-9 border-white/15 bg-black/40 text-zinc-100 placeholder:text-zinc-500"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9 bg-white/15 text-zinc-100 hover:bg-white/25"
          >
            Search
          </Button>
        </form>

        {searchQuery ? (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-black/40">
            {searchLoading ? (
              <p className="px-3 py-2 text-xs text-zinc-500">Searching…</p>
            ) : searchHits.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500">No succeeded matches.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {searchHits.map((hit) => {
                  const added = storyIds.includes(hit.story_id)
                  return (
                    <li
                      key={hit.story_id}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-100">
                          {hit.title || hit.story_id}
                        </p>
                        <p className="truncate font-mono text-[10px] text-zinc-500">
                          {hit.story_id}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={added || atCap}
                        className="h-7 shrink-0 bg-white/15 text-xs text-zinc-100 hover:bg-white/25 disabled:opacity-40"
                        onClick={() => addStory(hit.story_id, hit.title)}
                      >
                        {added ? 'Added' : atCap ? 'Cap' : 'Add'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-[10px] uppercase tracking-wide text-zinc-500">
            In graph ({storyIds.length}/{UNION_MAX_STORIES})
          </span>
          {documents.length === 0 && storyIds.length === 0 ? (
            <span className="text-xs text-zinc-500">None yet — search and add stories.</span>
          ) : null}
          {(documents.length > 0 ? documents : storyIds.map((uid) => ({
              uid,
              title: null as string | null,
              found: true,
              utteranceCount: 0,
              agentCount: 0,
            }))).map((doc) => (
            <span
              key={doc.uid}
              className={cn(
                'inline-flex max-w-[18rem] items-center gap-1 rounded-full border px-2 py-1 text-[11px]',
                activeDocUid === doc.uid
                  ? 'border-white/25 bg-white/15 text-zinc-100'
                  : 'border-white/10 bg-transparent text-zinc-300',
                !doc.found && 'border-amber-500/40 text-amber-200'
              )}
            >
              <button
                type="button"
                className="min-w-0 truncate hover:underline"
                title={doc.title || doc.uid}
                onClick={() => {
                  setActiveDocUid(doc.uid)
                  setHighlight(null)
                }}
              >
                {doc.title || `${doc.uid.slice(0, 8)}…`}
              </button>
              <button
                type="button"
                aria-label={`Remove ${doc.title || doc.uid}`}
                className="rounded-full px-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-100"
                onClick={() => removeStory(doc.uid)}
              >
                ×
              </button>
            </span>
          ))}
          {storyIds.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              onClick={() => setStoryIds([])}
            >
              Clear all
            </Button>
          ) : null}
        </div>
      </div>

      {storyIds.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-sm text-zinc-300">Build a custom multi-story graph</p>
          <p className="max-w-md text-xs text-zinc-500">
            Search for similar articles above and add them one by one. Drop any story with ×.
            URL updates with <code className="text-zinc-400">?ids=</code> so you can share the
            composition.
          </p>
        </div>
      ) : loading && !projection ? (
        <p className="p-6 text-sm text-zinc-400">Loading union graph…</p>
      ) : projection ? (
        <div
          className={
            passageOpen
              ? 'relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(160px,28%)]'
              : 'relative flex min-h-0 flex-1 flex-col'
          }
        >
          {loading ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-white/15 bg-zinc-950/95 px-3 py-1.5 text-xs text-zinc-300 shadow-lg">
              Refreshing union…
            </div>
          ) : null}
          <NeoProjectionExplorer
            projection={projection}
            contextStoryId={activeDocUid}
            defaultFilters={DEFAULT_NEO_FILTERS}
            onUtteranceHighlight={onUtteranceHighlight}
          />
          {passageOpen ? (
            <div className="min-h-0 border-t border-white/10 bg-zinc-950">
              <NeoPassagePanel
                title={
                  passage?.title ??
                  activeDoc?.title ??
                  (activeDocUid ? `Document ${activeDocUid.slice(0, 8)}…` : 'Passage')
                }
                content={passage?.content_clean ?? ''}
                highlight={highlight}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="p-6 text-sm text-red-400">
          {error || 'No graph data for the selected stories.'}
        </p>
      )}
    </div>
  )
}
