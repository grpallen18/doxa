/**
 * Chunk agent flow UI state — run: npx tsx scripts/test-chunk-pipeline-status.ts
 */
import type { StoryExtractionReviewPayload } from '../lib/admin/story-extraction-review.ts'
import { getChunkLaneQaRevertTip } from '../lib/admin/pipeline-status/chunk-revert-tip.ts'
import {
  chunkStepProgressLabel,
  isChunkStepDomainComplete,
  isChunkStepRunnable,
} from '../lib/admin/pipeline-status/chunk-step-runnable.ts'

let passed = 0
let failed = 0

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++
    console.log(`  ok ${name}`)
  } else {
    failed++
    console.error(`  FAIL ${name}`)
  }
}

function baseChunk(
  overrides: Partial<StoryExtractionReviewPayload['chunks'][number]> = {}
): StoryExtractionReviewPayload['chunks'][number] {
  return {
    chunk_index: 0,
    friendly_id: 'chk_1',
    content: 'Some chunk text for grounding.',
    extraction_json: { claims: [{ claim_id: 'c1', raw_text: 'Claim one.' }] },
    active_claim_version_id: null,
    claims_merge_eligibility: null,
    extraction_qa_status: null,
    extraction_qa_standardization_report: null,
    extraction_qa_review_report: null,
    extraction_qa_validation_report: null,
    extraction_qa_refinement_count: 0,
    extraction_qa_validation_attempt_count: 0,
    extraction_qa_validated_at: null,
    positions_extraction_json: null,
    positions_qa_status: null,
    positions_qa_review_report: null,
    positions_qa_validation_report: null,
    positions_qa_refinement_count: 0,
    positions_qa_validation_attempt_count: 0,
    positions_qa_validated_at: null,
    claim_versions: [],
    ...overrides,
  }
}

const emptyPayload = {
  qa_artifacts: [],
} as StoryExtractionReviewPayload

console.log('isChunkStepRunnable')
{
  const chunk = baseChunk({ extraction_json: null, extraction_qa_status: null })
  assert(
    'extract runnable when not started',
    isChunkStepRunnable('extract-story-claims', chunk, emptyPayload)
  )
  assert(
    'validate not runnable before extract',
    !isChunkStepRunnable('validate-chunk-claims', chunk, emptyPayload)
  )
}

{
  const chunk = baseChunk({ extraction_qa_status: 'pending' })
  assert(
    'validate runnable when awaiting review',
    isChunkStepRunnable('validate-chunk-claims', chunk, emptyPayload)
  )
  assert(
    'refine not runnable when awaiting review',
    !isChunkStepRunnable('refine-chunk-claims', chunk, emptyPayload)
  )
}

{
  const chunk = baseChunk({ extraction_qa_status: 'needs_refinement' })
  assert(
    'refine runnable when needs_refinement',
    isChunkStepRunnable('refine-chunk-claims', chunk, emptyPayload)
  )
}

{
  const chunk = baseChunk({ extraction_qa_status: 'awaiting_approval' })
  assert(
    'approve runnable when awaiting_approval',
    isChunkStepRunnable('approve-chunk-claims', chunk, emptyPayload)
  )
  assert(
    'refine not runnable when awaiting approval',
    !isChunkStepRunnable('refine-chunk-claims', chunk, emptyPayload)
  )
}

console.log('isChunkStepDomainComplete')
{
  const chunk = baseChunk({ extraction_qa_status: 'passed' })
  assert('extract complete when passed', isChunkStepDomainComplete('extract-story-claims', chunk))
  assert('validate complete when passed', isChunkStepDomainComplete('validate-chunk-claims', chunk))
  assert('refine complete when passed (fast path)', isChunkStepDomainComplete('refine-chunk-claims', chunk))
  assert('approve complete when passed', isChunkStepDomainComplete('approve-chunk-claims', chunk))
}

{
  const chunk = baseChunk({ extraction_qa_status: 'awaiting_approval' })
  assert('refine complete when awaiting approval', isChunkStepDomainComplete('refine-chunk-claims', chunk))
  assert('approve not complete when awaiting approval', !isChunkStepDomainComplete('approve-chunk-claims', chunk))
}

console.log('chunkStepProgressLabel')
{
  const chunk = baseChunk({ extraction_qa_status: 'awaiting_approval' })
  assert(
    'approve label',
    chunkStepProgressLabel('approve-chunk-claims', chunk) === 'Awaiting approval'
  )
}

console.log('getChunkLaneQaRevertTip')
{
  const chunk = baseChunk({ extraction_qa_status: 'awaiting_approval' })
  assert(
    'revert refine when awaiting approval without refine artifact in payload',
    getChunkLaneQaRevertTip('claims', chunk, emptyPayload) === 'refine-chunk-claims'
  )
}

{
  const chunk = baseChunk({ extraction_qa_status: 'awaiting_approval' })
  const payload = {
    ...emptyPayload,
    qa_artifacts: [
      {
        id: 'a1',
        stage: 'chunk_refine_claims',
        chunk_index: 0,
        created_at: '2026-01-02T00:00:00Z',
        reverted_at: null,
      },
    ],
  } as StoryExtractionReviewPayload

  assert(
    'revert refine when awaiting approval with refine artifact',
    getChunkLaneQaRevertTip('claims', chunk, payload) === 'refine-chunk-claims'
  )
}

{
  const chunk = baseChunk({ extraction_qa_status: 'awaiting_approval' })
  const payload = {
    ...emptyPayload,
    qa_artifacts: [
      {
        id: 'a1',
        stage: 'chunk_refine_claims',
        chunk_index: 0,
        created_at: '2026-01-01T00:00:00Z',
        reverted_at: null,
      },
      {
        id: 'a2',
        stage: 'chunk_approve_claims',
        chunk_index: 0,
        created_at: '2026-01-02T00:00:00Z',
        reverted_at: null,
      },
    ],
  } as StoryExtractionReviewPayload

  assert(
    'revert approve when approve artifact exists',
    getChunkLaneQaRevertTip('claims', chunk, payload) === 'approve-chunk-claims'
  )
}

{
  const chunk = baseChunk({ extraction_qa_status: 'needs_refinement', extraction_qa_review_report: { ok: true } })
  assert(
    'revert review when needs_refinement without review artifact',
    getChunkLaneQaRevertTip('claims', chunk, emptyPayload) === 'validate-chunk-claims'
  )
}

{
  const chunk = baseChunk({ extraction_qa_status: 'pending' })
  assert(
    'revert extract when only extract done',
    getChunkLaneQaRevertTip('claims', chunk, emptyPayload) === 'extract-story-claims'
  )
}

console.log('')
if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`)
  process.exit(1)
}
console.log(`All ${passed} assertions passed.`)
