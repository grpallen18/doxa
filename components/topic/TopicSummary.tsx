'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { Link2 } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type TopicSearchResult = {
  topic_id: string
  title: string
  slug: string
  summary: string | null
}

type TopicSummaryProps = {
  summary: string
  topicId: string
}

export default function TopicSummary({ summary, topicId }: TopicSummaryProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const [showToolbar, setShowToolbar] = useState(false)
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 })
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TopicSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<TopicSearchResult | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (text && containerRef.current?.contains(sel?.anchorNode ?? null)) {
      setSelection(text)
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const containerRect = containerRef.current.getBoundingClientRect()
      setToolbarPos({
        top: rect.top - containerRect.top - 40,
        left: rect.left - containerRect.left,
      })
      setShowToolbar(true)
    } else {
      setShowToolbar(false)
      setSelection(null)
    }
  }, [])

  const handleSuggestLink = useCallback(() => {
    if (selection) {
      setModalOpen(true)
      setSearchQuery('')
      setSearchResults([])
      setSelectedTopic(null)
      setSubmitError(null)
    }
    setShowToolbar(false)
  }, [selection])

  const handleSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    try {
      const res = await fetch(`/api/topics/search?q=${encodeURIComponent(q)}&limit=8`)
      const json = await res.json()
      if (res.ok && json?.data) {
        setSearchResults(json.data.filter((t: TopicSearchResult) => t.topic_id !== topicId))
      } else {
        setSearchResults([])
      }
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [topicId])

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(searchQuery)
      searchTimeoutRef.current = null
    }, 250)
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [searchQuery, handleSearch])

  const handleSubmit = useCallback(async () => {
    if (!selection || !selectedTopic) return
    setSubmitLoading(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/topics/${topicId}/suggest-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ span_text: selection, target_topic_id: selectedTopic.topic_id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSubmitError(json?.error?.message ?? 'Failed to submit suggestion')
        return
      }
      if (json?.ok === true) {
        setModalOpen(false)
        setSelection(null)
        setSelectedTopic(null)
        router.refresh()
      } else {
        setSubmitError(json?.reason ?? 'Suggestion was not approved')
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitLoading(false)
    }
  }, [selection, selectedTopic, topicId, router])

  return (
    <div ref={containerRef} className="relative" onMouseUp={handleMouseUp}>
      <div className="prose prose-sm max-w-none text-foreground prose-headings:font-semibold prose-p:text-foreground prose-a:text-accent-primary prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith('/page/')) {
                return (
                  <Link href={href} className="text-accent-primary hover:underline">
                    {children}
                  </Link>
                )
              }
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">
                  {children}
                </a>
              )
            },
          }}
        >
          {summary}
        </ReactMarkdown>
      </div>

      {showToolbar && selection && (
        <div
          className="absolute z-10 flex items-center gap-1 rounded-md border border-subtle bg-surface px-2 py-1 shadow-panel-soft"
          style={{ top: toolbarPos.top, left: toolbarPos.left }}
        >
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2"
            onClick={handleSuggestLink}
          >
            <Link2 size={14} />
            Suggest link
          </Button>
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="suggest-link-dialog-title"
          onClick={() => setModalOpen(false)}
        >
          <Panel
            variant="base"
            className="max-w-md p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="suggest-link-dialog-title" className="mb-3 text-lg font-semibold">
              Suggest link
            </h2>
            <p className="mb-2 text-sm text-muted">
              Selected text: &quot;{selection?.slice(0, 80)}{selection && selection.length > 80 ? '…' : ''}&quot;
            </p>
            <div className="mb-4 space-y-2">
              <Label htmlFor="topic-search">Search for topic to link</Label>
              <Input
                id="topic-search"
                placeholder="Search topics…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchLoading && <p className="text-xs text-muted">Searching…</p>}
              {searchResults.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border border-subtle p-2">
                  {searchResults.map((t) => (
                    <li key={t.topic_id}>
                      <button
                        type="button"
                        className={`block w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                          selectedTopic?.topic_id === t.topic_id ? 'bg-muted' : ''
                        }`}
                        onClick={() => setSelectedTopic(t)}
                      >
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {submitError && (
              <p className="mb-3 text-sm text-destructive">{submitError}</p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={submitLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitLoading || !selectedTopic}
              >
                {submitLoading ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
