import { exportChunkPositionRecords, flattenExtractionJson } from '@/lib/admin/chunk-extraction'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { positionsChunkQaCounts } from '@/lib/admin/pipeline-status/extraction'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

function buildExtractStoryClaimsOutput(payload: StoryExtractionReviewPayload) {
  const chunks = payload.chunks.map((chunk) => {
    const extraction = chunk.extraction_json
      ? flattenExtractionJson(chunk.chunk_index, chunk.extraction_json)
      : null

    return {
      chunk_index: chunk.chunk_index,
      chunk_friendly_id: chunk.friendly_id,
      extraction_json: chunk.extraction_json,
      claims: extraction?.claims ?? [],
      claims_count: extraction?.claims.length ?? 0,
    }
  })

  return {
    total_chunks: payload.chunks.length,
    chunks_with_extraction: chunks.filter((chunk) => chunk.extraction_json != null).length,
    claims_count: chunks.reduce((sum, chunk) => sum + chunk.claims_count, 0),
    chunks,
  }
}

function buildValidateChunkPositionsOutput(payload: StoryExtractionReviewPayload) {
  const chunks = payload.chunks
    .filter(
      (chunk) =>
        chunk.positions_extraction_json != null && chunk.positions_qa_review_report != null
    )
    .map((chunk) => ({
      chunk_index: chunk.chunk_index,
      chunk_friendly_id: chunk.friendly_id,
      positions_qa_status: chunk.positions_qa_status,
      positions_qa_review_report: chunk.positions_qa_review_report,
      positions_qa_validation_report: chunk.positions_qa_validation_report,
      positions_qa_validation_attempt_count: chunk.positions_qa_validation_attempt_count,
    }))

  return {
    chunks_reviewed: chunks.length,
    chunks,
  }
}

function buildRefineChunkPositionsOutput(payload: StoryExtractionReviewPayload) {
  const chunks = payload.chunks
    .filter((chunk) => (chunk.positions_qa_refinement_count ?? 0) > 0)
    .map((chunk) => ({
      chunk_index: chunk.chunk_index,
      chunk_friendly_id: chunk.friendly_id,
      positions_qa_status: chunk.positions_qa_status,
      positions_qa_refinement_count: chunk.positions_qa_refinement_count,
      positions: exportChunkPositionRecords(chunk.positions_extraction_json),
    }))

  return {
    chunks_refined: chunks.length,
    chunks,
  }
}

function buildExtractStoryPositionsOutput(payload: StoryExtractionReviewPayload) {
  const chunks = payload.chunks.map((chunk) => {
    const positions = exportChunkPositionRecords(chunk.positions_extraction_json)

    return {
      chunk_index: chunk.chunk_index,
      chunk_friendly_id: chunk.friendly_id,
      positions_extraction_json: chunk.positions_extraction_json,
      positions,
      positions_count: positions.length,
    }
  })

  const positionsCounts = positionsChunkQaCounts(payload)

  return {
    total_chunks: payload.chunks.length,
    chunks_with_positions: positionsCounts.withJson,
    positions_count: chunks.reduce((sum, chunk) => sum + chunk.positions_count, 0),
    chunks,
  }
}

export function getStoryStepExportOutput(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): unknown | null {
  switch (stepId) {
    case 'extract-story-claims':
      return buildExtractStoryClaimsOutput(payload)
    case 'extract-story-positions':
      return buildExtractStoryPositionsOutput(payload)
    case 'validate-chunk-positions':
      return buildValidateChunkPositionsOutput(payload)
    case 'refine-chunk-positions':
      return buildRefineChunkPositionsOutput(payload)
    default:
      return null
  }
}
