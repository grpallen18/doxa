'use client'

import { useMemo, useRef, useState } from 'react'
import { HighlightedArticleText } from '@/components/admin/highlighted-article-text'
import { ScrollArea } from '@/components/ui/scroll-area'
import { claimRowKey } from '@/lib/admin/chunk-claim-ids'
import {
  flattenExtractionJson,
  type ChunkClaim,
} from '@/lib/admin/chunk-extraction'
import {
  resolveChunkContentSpan,
  type ArticleSpan,
} from '@/lib/admin/article-span-highlight'
import {
  RecordLedgerTable,
  recordLedgerValueClass,
} from '@/components/admin/record/record-ledger-table'
import { cn } from '@/lib/utils'

const CLAIMS_GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,5.5rem)_minmax(4.5rem,5.5rem)] gap-x-4'

function claimRowSpan(content: string, claim: ChunkClaim): ArticleSpan | null {
  return resolveChunkContentSpan(content, {
    spanStart: claim.span_start,
    spanEnd: claim.span_end,
    sourceExcerpt: claim.source_excerpt,
  })
}


export function ChunkContentExtractionLayout({
  content,
  extractionJson,
  chunkIndex,
}: {
  content: string
  extractionJson: unknown | null
  chunkIndex: number
}) {
  const [highlightSpan, setHighlightSpan] = useState<ArticleSpan | null>(null)
  const [hoveredClaimKey, setHoveredClaimKey] = useState<string | null>(null)
  const contentViewportRef = useRef<HTMLDivElement>(null)

  const claims = useMemo(() => {
    if (!extractionJson) return []
    return flattenExtractionJson(chunkIndex, extractionJson).claims
  }, [extractionJson, chunkIndex])

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <ScrollArea
        ref={contentViewportRef}
        type="always"
        className={cn(
          'h-[min(50vh,28rem)] min-h-0 overflow-hidden rounded-md border border-subtle bg-surface',
          '[&_[data-slot=scroll-area-viewport]]:h-full [&_[data-slot=scroll-area-viewport]]:max-h-full',
          '[&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/50'
        )}
      >
        <div className="p-4">
          <article className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed dark:prose-invert">
            {content ? (
              <HighlightedArticleText
                text={content}
                highlight={highlightSpan}
                scrollViewportRef={contentViewportRef}
              />
            ) : (
              <p className="text-muted italic">No chunk content available.</p>
            )}
          </article>
        </div>
      </ScrollArea>

      <div className="min-w-0">
        <RecordLedgerTable
          columns={['Claim', 'Polarity', 'Stance']}
          gridClass={CLAIMS_GRID}
        >
          <ol className="divide-y divide-subtle">
            {claims.length === 0 ? (
              <li className={cn(CLAIMS_GRID, 'items-baseline px-3 py-2')}>
                <span className="text-xs italic text-muted">No extracted claims yet.</span>
                <span className="text-xs text-muted/60">—</span>
                <span className="text-xs text-muted/60">—</span>
              </li>
            ) : (
              claims.map((claim) => {
                const span = claimRowSpan(content, claim)
                const rowKey = claimRowKey({ claim_id: claim.claim_id, index: claim.index })
                const isHovered = hoveredClaimKey === rowKey

                return (
                  <li
                    key={rowKey}
                    className={cn(
                      CLAIMS_GRID,
                      'items-baseline px-3 py-2 transition-colors cursor-default',
                      isHovered && (span ? 'bg-[var(--provenance-highlight)]' : 'bg-muted/40')
                    )}
                    onMouseEnter={() => {
                      setHoveredClaimKey(rowKey)
                      setHighlightSpan(span)
                    }}
                    onMouseLeave={() => {
                      setHoveredClaimKey(null)
                      setHighlightSpan(null)
                    }}
                  >
                    <span
                      className={cn(
                        recordLedgerValueClass,
                        'min-w-0 break-words whitespace-pre-wrap'
                      )}
                    >
                      {claim.raw_text}
                    </span>
                    <span className={recordLedgerValueClass}>{claim.polarity ?? '—'}</span>
                    <span className={recordLedgerValueClass}>{claim.stance ?? '—'}</span>
                  </li>
                )
              })
            )}
          </ol>
        </RecordLedgerTable>
      </div>
    </div>
  )
}
