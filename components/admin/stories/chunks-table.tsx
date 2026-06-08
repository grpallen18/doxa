'use client'

import Link from 'next/link'
import { chunkAdminHref } from '@/lib/admin/chunk-record'
import {
  RecordLedgerCell,
  RecordLedgerTable,
  recordLedgerRowClass,
  recordLedgerValueClass,
} from '@/components/admin/record/record-ledger-table'
import { cn } from '@/lib/utils'

const CHUNKS_GRID = 'grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] gap-x-4'

type ChunkRow = {
  friendly_id: string
  content: string | null
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
    <RecordLedgerTable columns={['Chunk ID', 'Chunk Length']} gridClass={CHUNKS_GRID}>
      <ol className="divide-y divide-subtle">
        {chunks.map((chunk) => {
          const length = chunk.content?.length ?? 0

          return (
            <li key={chunk.friendly_id} className={recordLedgerRowClass(CHUNKS_GRID)}>
              <Link
                href={chunkAdminHref(story, { friendly_id: chunk.friendly_id })}
                className={cn(recordLedgerValueClass, 'font-mono text-[11px] text-accent-primary hover:underline')}
              >
                {chunk.friendly_id}
              </Link>
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
