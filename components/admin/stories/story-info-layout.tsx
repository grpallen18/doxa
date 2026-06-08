'use client'

import { useRef } from 'react'
import { Check, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HighlightedArticleText } from '@/components/admin/highlighted-article-text'
import { RecordFieldGrid } from '@/components/admin/record/record-field-grid'
import type { ArticleSpan } from '@/lib/admin/article-span-highlight'
import { cn } from '@/lib/utils'

export function StoryInfoLayout({
  author,
  publishedAt,
  ingestedAt,
  friendlyId,
  storyUuid,
  relevanceStatus,
  relevanceScore,
  scrapeFailCount,
  hasContentClean,
  chunkCount,
  articleText,
  highlightSpan,
}: {
  author: string | null
  publishedAt: string
  ingestedAt: string
  friendlyId: string
  storyUuid?: string
  relevanceStatus: string | null
  relevanceScore: number | null
  scrapeFailCount: number
  hasContentClean: boolean
  chunkCount: number
  articleText: string | null
  highlightSpan: ArticleSpan | null
}) {
  const articleViewportRef = useRef<HTMLDivElement>(null)

  const qualifiedStatus = relevanceStatus?.trim().toUpperCase() ?? null
  const isQualified = qualifiedStatus === 'KEEP'

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <div id="source-content" className="min-w-0 scroll-mt-24">
        <ScrollArea
          ref={articleViewportRef}
          type="always"
          className={cn(
            'h-[min(37.5vh,21rem)] min-h-0 overflow-hidden rounded-md border border-subtle bg-surface',
            '[&_[data-slot=scroll-area-viewport]]:h-full [&_[data-slot=scroll-area-viewport]]:max-h-full',
            '[&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/50'
          )}
        >
          <div className="p-4">
            <article className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed dark:prose-invert">
              {articleText ? (
                <HighlightedArticleText
                  text={articleText}
                  highlight={highlightSpan}
                  scrollViewportRef={articleViewportRef}
                />
              ) : (
                <p className="text-muted italic">No article text available.</p>
              )}
            </article>
          </div>
        </ScrollArea>
      </div>

      <RecordFieldGrid
        fields={[
          { label: 'Author', value: author },
          {
            label: 'Published',
            value: publishedAt === '—' ? null : publishedAt,
          },
          { label: 'Ingested', value: ingestedAt === '—' ? null : ingestedAt },
          {
            label: 'Story ID',
            value: (
              <span className="block truncate" title={storyUuid ?? friendlyId}>
                {friendlyId}
              </span>
            ),
          },
          {
            label: 'Qualified?',
            value: isQualified ? (
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Yes" />
            ) : (
              <X className="size-4 text-red-600 dark:text-red-400" aria-label="No" />
            ),
          },
          { label: 'Qualified status', value: qualifiedStatus ?? '—' },
          { label: 'Relevance score', value: relevanceScore ?? null },
          { label: 'Scrape failures', value: scrapeFailCount },
          {
            label: 'Content clean',
            value: hasContentClean ? (
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Yes" />
            ) : (
              <X className="size-4 text-red-600 dark:text-red-400" aria-label="No" />
            ),
          },
          { label: 'Number of chunks', value: chunkCount },
        ]}
      />
    </div>
  )
}
