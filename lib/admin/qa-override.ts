import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export type QaOverrideScope = 'chunks' | 'merge' | 'both'

export type ChunkOverrideRecord = {
  chunk_index: number
  prior_status: string
  prior_validated_at: string | null
}

export type HumanOverrideReport = {
  approved_by_admin: boolean
  scope: QaOverrideScope
  include_chunks?: boolean
  story_qa_overridden?: boolean
  prior_story_qa_status?: string | null
  prior_story_qa_validated_at?: string | null
  chunk_overrides?: ChunkOverrideRecord[]
}

export function parseQaOverrideScope(value: unknown): QaOverrideScope | null {
  if (value === 'chunks' || value === 'merge' || value === 'both') return value
  return null
}

export function parseHumanOverrideReport(report: unknown): HumanOverrideReport | null {
  if (!report || typeof report !== 'object') return null
  const row = report as Record<string, unknown>
  if (row.approved_by_admin !== true) return null
  return row as HumanOverrideReport
}

export function getLatestActiveHumanOverride(payload: StoryExtractionReviewPayload) {
  let latest: StoryExtractionReviewPayload['qa_artifacts'][number] | null = null
  for (const artifact of payload.qa_artifacts) {
    if (artifact.stage !== 'human_override') continue
    if (artifact.reverted_at) continue
    if (!latest || artifact.created_at > latest.created_at) latest = artifact
  }
  return latest
}

export function canUndoHumanOverride(payload: StoryExtractionReviewPayload): boolean {
  const artifact = getLatestActiveHumanOverride(payload)
  if (!artifact) return false
  const report = parseHumanOverrideReport(artifact.report)
  if (!report) return false
  if ((report.chunk_overrides?.length ?? 0) > 0) return true
  if (report.story_qa_overridden === true) return true
  if (
    !report.chunk_overrides?.length &&
    report.include_chunks !== false &&
    payload.story.extraction_qa_status === 'passed' &&
    payload.story.merged_at == null
  ) {
    return true
  }
  return false
}

export function inferQaOverrideScopeFromPayload(
  payload: StoryExtractionReviewPayload
): QaOverrideScope {
  const chunkHuman = payload.chunks.some(
    (c) => c.extraction_qa_status === 'needs_human_review'
  )
  const mergeHuman = payload.story.extraction_qa_status === 'needs_human_review'
  if (chunkHuman && !mergeHuman && payload.story.merged_at == null) return 'chunks'
  if (mergeHuman && payload.story.merged_at != null) return 'merge'
  if (chunkHuman) return 'chunks'
  return 'both'
}
