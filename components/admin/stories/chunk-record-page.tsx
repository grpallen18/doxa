'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChunkContentExtractionLayout } from '@/components/admin/stories/chunk-content-extraction-layout'
import { ChunkExtractionExportButtons } from '@/components/admin/stories/chunk-extraction-export-buttons'
import { ChunkQaHistorySection } from '@/components/admin/stories/chunk-qa-history-section'
import { RecordAuditSection } from '@/components/admin/record/record-audit-section'
import { EntityHeader } from '@/components/admin/record/entity-header'
import { RecordEntityLinkBar } from '@/components/admin/record/record-entity-link-bar'
import { RecordFieldRow, recordFieldGridClass } from '@/components/admin/record/record-field-row'
import { RecordPageBody, RecordPageError, RecordPageFrame, RecordPageLoading } from '@/components/admin/record/record-page-frame'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import type { ChunkRecord } from '@/lib/admin/chunk-record'
import { formatChunkLabel } from '@/lib/admin/chunk-record'
import { storyAdminHref } from '@/lib/admin/friendly-id'
import { qaStatusLabel, type ExtractionQaStatus } from '@/lib/admin/extraction-qa-types'

function qaStatusDisplay(status: string | null | undefined): string {
  if (!status) return '—'
  return qaStatusLabel(status as ExtractionQaStatus)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export function ChunkRecordPage() {
  const params = useParams()
  const storyId = typeof params.id === 'string' ? params.id : ''
  const chunkRef = typeof params.chunkIndex === 'string' ? params.chunkIndex : ''

  const [data, setData] = useState<ChunkRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!storyId || !chunkRef.trim()) {
      setError('Invalid chunk')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    fetch(`/api/admin/stories/${storyId}/chunks/${encodeURIComponent(chunkRef)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok || json.error || !json.data) {
          setError(json.error?.message ?? 'Chunk not found')
          setData(null)
          return
        }
        setData(json.data)
      })
      .catch(() => {
        setError('Failed to load chunk')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [storyId, chunkRef])

  if (loading) return <RecordPageLoading message="Loading chunk…" />
  if (error || !data) {
    return <RecordPageError message={error ?? 'Not found'} />
  }

  const chunkApiBase = `/api/admin/stories/${storyId}/chunks/${encodeURIComponent(data.chunk_friendly_id)}`
  const auditPath = `${chunkApiBase}/audit`
  const qaHistoryPath = `${chunkApiBase}/qa-history`

  return (
    <RecordPageFrame>
      <EntityHeader
        layout="record"
        embedded
        entityType="chunk"
        title={formatChunkLabel(
          data.chunk_index,
          data.chunk_count,
          data.chunk_friendly_id
        )}
        subtitle="Story chunk"
      />
      <RecordEntityLinkBar
        links={[
          {
            label: 'Story',
            linkText: data.story_friendly_id ?? data.story_id,
            href: storyAdminHref({
              story_id: data.story_id,
              friendly_id: data.story_friendly_id,
            }),
          },
        ]}
      />

      <RecordPageBody>
        <RecordSectionCard id="chunk-info" title="Chunk info" variant="panel">
          <div className="grid gap-x-8 sm:grid-cols-2">
            <dl className={recordFieldGridClass}>
              <RecordFieldRow label="Chunk ID">{data.chunk_friendly_id}</RecordFieldRow>
              <RecordFieldRow label="Chunk index">{data.chunk_index + 1}</RecordFieldRow>
              <RecordFieldRow label="Chunk length">
                {data.content.length > 0
                  ? `${data.content.length.toLocaleString()} characters`
                  : null}
              </RecordFieldRow>
            </dl>
            <dl className={recordFieldGridClass}>
              <RecordFieldRow label="QA status">
                {data.extraction_qa_status
                  ? qaStatusDisplay(data.extraction_qa_status)
                  : null}
              </RecordFieldRow>
              <RecordFieldRow label="Validated at">
                {formatDate(data.extraction_qa_validated_at)}
              </RecordFieldRow>
              <RecordFieldRow label="Refinement cycles">
                {data.extraction_qa_refinement_count}
              </RecordFieldRow>
            </dl>
          </div>
        </RecordSectionCard>

        <RecordSectionCard
          id="chunk-source-extraction"
          title="Content & extraction"
          variant="panel"
          headerActions={<ChunkExtractionExportButtons record={data} />}
        >
          <ChunkContentExtractionLayout
            content={data.content}
            extractionJson={data.extraction_json}
            positionsExtractionJson={data.positions_extraction_json}
            chunkIndex={data.chunk_index}
          />
        </RecordSectionCard>

        <ChunkQaHistorySection apiPath={qaHistoryPath} variant="panel" />

        <RecordAuditSection apiPath={auditPath} title="History" variant="panel" />
      </RecordPageBody>
    </RecordPageFrame>
  )
}
