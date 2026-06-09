'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { HighlightedArticleText } from '@/components/admin/highlighted-article-text'
import { ScrollArea } from '@/components/ui/scroll-area'
import { claimRowKey } from '@/lib/admin/chunk-claim-ids'
import { positionRowKey } from '@/lib/admin/chunk-position-ids'
import {
  flattenExtractionJson,
  flattenPositionsExtractionJson,
  type ChunkClaim,
  type ChunkExtractedPosition,
} from '@/lib/admin/chunk-extraction'
import {
  resolveChunkContentSpan,
  type ArticleSpan,
} from '@/lib/admin/article-span-highlight'
import {
  RecordLedgerTable,
  recordLedgerValueClass,
  type RecordLedgerTab,
} from '@/components/admin/record/record-ledger-table'
import { cn } from '@/lib/utils'

const LEDGER_GRID =
  'grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,5.5rem)_minmax(4.5rem,5.5rem)] gap-x-4'

const EXTRACTION_TABS: RecordLedgerTab[] = [
  { id: 'claims', label: 'Claims' },
  { id: 'positions', label: 'Positions' },
]

type ExtractionTabId = (typeof EXTRACTION_TABS)[number]['id']

function entityRowSpan(
  content: string,
  entity: {
    span_start: number | null
    span_end: number | null
    source_excerpt: string | null
  }
): ArticleSpan | null {
  return resolveChunkContentSpan(content, {
    spanStart: entity.span_start,
    spanEnd: entity.span_end,
    sourceExcerpt: entity.source_excerpt,
  })
}

function LedgerHoverRow({
  gridClass,
  rowKey,
  span,
  hoveredKey,
  onHover,
  children,
}: {
  gridClass: string
  rowKey: string
  span: ArticleSpan | null
  hoveredKey: string | null
  onHover: (key: string | null, span: ArticleSpan | null) => void
  children: ReactNode
}) {
  const isHovered = hoveredKey === rowKey

  return (
    <li
      className={cn(
        gridClass,
        'items-baseline px-3 py-2 transition-colors cursor-default',
        isHovered && (span ? 'bg-[var(--provenance-highlight)]' : 'bg-muted/40')
      )}
      onMouseEnter={() => onHover(rowKey, span)}
      onMouseLeave={() => onHover(null, null)}
    >
      {children}
    </li>
  )
}

export function ChunkContentExtractionLayout({
  content,
  extractionJson,
  positionsExtractionJson,
  chunkIndex,
}: {
  content: string
  extractionJson: unknown | null
  positionsExtractionJson: unknown | null
  chunkIndex: number
}) {
  const [activeTab, setActiveTab] = useState<ExtractionTabId>('claims')
  const [highlightSpan, setHighlightSpan] = useState<ArticleSpan | null>(null)
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null)
  const contentViewportRef = useRef<HTMLDivElement>(null)

  const claims = useMemo(() => {
    if (!extractionJson) return []
    return flattenExtractionJson(chunkIndex, extractionJson).claims
  }, [extractionJson, chunkIndex])

  const positions = useMemo(() => {
    if (!positionsExtractionJson) return []
    return flattenPositionsExtractionJson(chunkIndex, positionsExtractionJson)
  }, [positionsExtractionJson, chunkIndex])

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId as ExtractionTabId)
    setHoveredRowKey(null)
    setHighlightSpan(null)
  }

  const handleRowHover = (rowKey: string | null, span: ArticleSpan | null) => {
    setHoveredRowKey(rowKey)
    setHighlightSpan(span)
  }

  const columns =
    activeTab === 'claims' ? ['Claim', 'Polarity', 'Stance'] : ['Position', 'Signal', 'Holder']

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
          columns={columns}
          gridClass={LEDGER_GRID}
          tabs={EXTRACTION_TABS}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        >
          <ol className="divide-y divide-subtle">
            {activeTab === 'claims' ? (
              <ClaimsRows
                claims={claims}
                content={content}
                gridClass={LEDGER_GRID}
                hoveredRowKey={hoveredRowKey}
                onHover={handleRowHover}
              />
            ) : (
              <PositionsRows
                positions={positions}
                content={content}
                gridClass={LEDGER_GRID}
                hoveredRowKey={hoveredRowKey}
                onHover={handleRowHover}
              />
            )}
          </ol>
        </RecordLedgerTable>
      </div>
    </div>
  )
}

function ClaimsRows({
  claims,
  content,
  gridClass,
  hoveredRowKey,
  onHover,
}: {
  claims: ChunkClaim[]
  content: string
  gridClass: string
  hoveredRowKey: string | null
  onHover: (rowKey: string | null, span: ArticleSpan | null) => void
}) {
  if (claims.length === 0) {
    return (
      <li className={cn(gridClass, 'items-baseline px-3 py-2')}>
        <span className="text-xs italic text-muted">No extracted claims yet.</span>
        <span className="text-xs text-muted/60">—</span>
        <span className="text-xs text-muted/60">—</span>
      </li>
    )
  }

  return (
    <>
      {claims.map((claim) => {
        const span = entityRowSpan(content, claim)
        const rowKey = claimRowKey({ claim_id: claim.claim_id, index: claim.index })

        return (
          <LedgerHoverRow
            key={rowKey}
            gridClass={gridClass}
            rowKey={rowKey}
            span={span}
            hoveredKey={hoveredRowKey}
            onHover={onHover}
          >
            <span className={cn(recordLedgerValueClass, 'min-w-0 break-words whitespace-pre-wrap')}>
              {claim.raw_text}
            </span>
            <span className={recordLedgerValueClass}>{claim.polarity ?? '—'}</span>
            <span className={recordLedgerValueClass}>{claim.stance ?? '—'}</span>
          </LedgerHoverRow>
        )
      })}
    </>
  )
}

function PositionsRows({
  positions,
  content,
  gridClass,
  hoveredRowKey,
  onHover,
}: {
  positions: ChunkExtractedPosition[]
  content: string
  gridClass: string
  hoveredRowKey: string | null
  onHover: (rowKey: string | null, span: ArticleSpan | null) => void
}) {
  if (positions.length === 0) {
    return (
      <li className={cn(gridClass, 'items-baseline px-3 py-2')}>
        <span className="text-xs italic text-muted">No extracted positions yet.</span>
        <span className="text-xs text-muted/60">—</span>
        <span className="text-xs text-muted/60">—</span>
      </li>
    )
  }

  return (
    <>
      {positions.map((position) => {
        const span = entityRowSpan(content, position)
        const rowKey = positionRowKey({ position_id: position.position_id, index: position.index })

        return (
          <LedgerHoverRow
            key={rowKey}
            gridClass={gridClass}
            rowKey={rowKey}
            span={span}
            hoveredKey={hoveredRowKey}
            onHover={onHover}
          >
            <span className={cn(recordLedgerValueClass, 'min-w-0 break-words whitespace-pre-wrap')}>
              {position.raw_text}
            </span>
            <span className={recordLedgerValueClass}>{position.signal_type ?? '—'}</span>
            <span className={recordLedgerValueClass}>{position.holder ?? '—'}</span>
          </LedgerHoverRow>
        )
      })}
    </>
  )
}
