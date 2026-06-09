'use client'

import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { chunkAdminHref } from '@/lib/admin/chunk-record'
import type { ExtractionQaStatus } from '@/lib/admin/extraction-qa-types'
import { isChunkClaimsQaComplete } from '@/lib/admin/pipeline-status/extraction'
import {
  RecordLedgerCell,
  RecordLedgerTable,
  recordLedgerRowClass,
  recordLedgerValueClass,
} from '@/components/admin/record/record-ledger-table'
import { cn } from '@/lib/utils'

const CHUNKS_GRID =
  'grid grid-cols-[minmax(8rem,12rem)_minmax(5rem,6rem)_minmax(0,1fr)] gap-x-4'

type ChunkRow = {
  friendly_id: string
  content: string | null
  extraction_json: unknown | null
  extraction_qa_status: ExtractionQaStatus
}

function QaCompleteIcon({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <Check
        className="size-4 text-emerald-600 dark:text-emerald-400"
        aria-label="QA complete"
      />
    )
  }
  return <X className="size-4 text-muted" aria-label="QA incomplete" />
}

export function ChunksTable({
  story,
  chunks,
}: {
  story: { story_id: string; friendly_id?: string | null }
  chunks: ChunkRow[]
}) {
  if (chunks.length === 0) {
    return <p className="text-xs text-muted">No chunks yet.</p>
  }

  return (
    <RecordLedgerTable
      columns={['Chunk ID', 'QA Complete?', 'Chunk Length']}
      gridClass={CHUNKS_GRID}
    >
      <ol className="divide-y divide-subtle">
        {chunks.map((chunk) => {
          const length = chunk.content?.length ?? 0
          const qaComplete = isChunkClaimsQaComplete(chunk)

          return (
            <li key={chunk.friendly_id} className={recordLedgerRowClass(CHUNKS_GRID)}>
              <Link
                href={chunkAdminHref(story, { friendly_id: chunk.friendly_id })}
                className={cn(
                  recordLedgerValueClass,
                  'text-accent-primary hover:text-accent-primary/80 hover:underline'
                )}
              >
                {chunk.friendly_id}
              </Link>
              <span className={cn(recordLedgerValueClass, 'flex items-center')}>
                <QaCompleteIcon complete={qaComplete} />
              </span>
              <span className={recordLedgerValueClass}>
                <RecordLedgerCell>
                  {length > 0 ? `${length.toLocaleString()} characters` : null}
                </RecordLedgerCell>
              </span>
            </li>
          )
        })}
      </ol>
    </RecordLedgerTable>
  )
}
