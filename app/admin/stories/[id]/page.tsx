'use client'

import { useCallback, useState } from 'react'
import { HighlightedArticleText } from '@/components/admin/highlighted-article-text'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ArticleSpan } from '@/lib/admin/article-span-highlight'
import { qaStatusLabel } from '@/lib/admin/extraction-qa-types'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminStoryHubPage() {
  const { storyId, payload, refresh } = useStoryReview()
  const [approving, setApproving] = useState(false)
  const [highlightSpan, setHighlightSpan] = useState<ArticleSpan | null>(null)

  const approveQa = useCallback(async () => {
    setApproving(true)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/qa-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_chunks: true }),
      })
      if (res.ok) await refresh(true)
    } finally {
      setApproving(false)
    }
  }, [storyId, refresh])

  if (!payload) return null

  const { story } = payload

  return (
    <Panel
      variant="soft"
      interactive={false}
      className="flex min-h-[400px] flex-col overflow-hidden lg:h-[calc(100vh-12rem)] lg:min-h-0"
    >
      <div className="shrink-0 border-b border-subtle p-4">
        <h2 className="text-lg font-semibold leading-snug">{story.title}</h2>
        <div className="mt-2 space-y-1 text-xs text-muted">
          <p>{story.source_name ?? 'Unknown source'}</p>
          <p>Published {formatDate(story.published_at)}</p>
          <p>
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary hover:underline"
            >
              Open original
            </a>
          </p>
          <p>Status: {story.extraction_status}</p>
          <p>QA: {qaStatusLabel(story.extraction_qa_status)}</p>
          {story.extraction_qa_status === 'needs_human_review' && (
            <Button type="button" size="sm" variant="outline" disabled={approving} onClick={approveQa}>
              {approving ? 'Approving…' : 'Approve QA'}
            </Button>
          )}
        </div>
      </div>
      <ScrollArea
        className="min-h-0 flex-1 overflow-hidden p-4 lg:h-0"
        onMouseLeave={() => setHighlightSpan(null)}
      >
        <article className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed dark:prose-invert">
          {story.article_text ? (
            <HighlightedArticleText text={story.article_text} highlight={highlightSpan} />
          ) : (
            <p className="text-muted italic">No article text available.</p>
          )}
        </article>
      </ScrollArea>
    </Panel>
  )
}
