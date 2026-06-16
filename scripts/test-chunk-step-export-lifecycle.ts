/**
 * Chunk step export lineage — run: npx tsx scripts/test-chunk-step-export-lifecycle.ts
 */
import type { StoryExtractionReviewPayload } from '../lib/admin/story-extraction-review.ts'
import {
  assembleChunkLaneLifecycle,
  buildChunkRefinementsExport,
  checkChunkExportInvariants,
  filterVisibleClaimVersions,
  mergeChunkReviewsExport,
  filterChunkLaneArtifacts,
  resolveExportActiveVersionId,
} from '../lib/admin/chunk-step-export.ts'
import { deriveChunkLanePhase } from '../lib/admin/pipeline-status/chunk-phase.ts'
import { findOrphanedClaimVersions } from '../lib/admin/orphaned-claim-versions.ts'

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

const EXTRACTOR_V0 = 'version-extractor-v0'
const REFINER_V1 = 'version-refiner-v1'
const REVIEW_ARTIFACT = 'artifact-review-1'
const REFINE_ARTIFACT = 'artifact-refine-1'

function baseArtifact(
  overrides: Partial<StoryExtractionReviewPayload['qa_artifacts'][number]> = {}
): StoryExtractionReviewPayload['qa_artifacts'][number] {
  return {
    id: 'artifact-id',
    stage: 'chunk_review_claims',
    chunk_index: 0,
    input_snapshot: null,
    output_snapshot: null,
    report: {},
    run_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    reverted_at: null,
    claim_version_id: null,
    input_claim_version_id: null,
    output_claim_version_id: null,
    ...overrides,
  }
}

function baseChunk(
  overrides: Partial<StoryExtractionReviewPayload['chunks'][number]> = {}
): StoryExtractionReviewPayload['chunks'][number] {
  return {
    chunk_index: 0,
    friendly_id: 'chk_1',
    content: 'Chunk text.',
    extraction_json: { claims: [] },
    active_claim_version_id: EXTRACTOR_V0,
    claims_merge_eligibility: null,
    extraction_qa_status: 'needs_refinement',
    extraction_qa_standardization_report: null,
    extraction_qa_review_report: {
      resolved_status: 'needs_refinement',
      reviewed_claim_version_id: EXTRACTOR_V0,
    },
    extraction_qa_validation_report: null,
    extraction_qa_refinement_count: 0,
    extraction_qa_validation_attempt_count: 1,
    extraction_qa_validated_at: null,
    positions_extraction_json: null,
    positions_qa_status: null,
    positions_qa_review_report: null,
    positions_qa_validation_report: null,
    positions_qa_refinement_count: 0,
    positions_qa_validation_attempt_count: 0,
    positions_qa_validated_at: null,
    claim_versions: [
      {
        id: EXTRACTOR_V0,
        chunk_index: 0,
        version_number: 0,
        source: 'extractor',
        parent_version_id: null,
        created_from_review_artifact_id: null,
        review_outcome: 'needs_refinement',
        created_at: '2026-01-01T00:00:00.000Z',
        claims_json: { claims: [] },
      },
    ],
    claims_lane_phase: 'awaiting_refine',
    claims_lane_phase_label: 'Awaiting refine',
    positions_lane_phase: 'not_started',
    positions_lane_phase_label: 'Not started',
    ...overrides,
  }
}

function happyPathPayload(): StoryExtractionReviewPayload {
  const reviewArtifact = baseArtifact({
    id: REVIEW_ARTIFACT,
    stage: 'chunk_review_claims',
    claim_version_id: EXTRACTOR_V0,
    report: {
      resolved_status: 'needs_refinement',
      reviewed_claim_version_id: EXTRACTOR_V0,
    },
  })
  const refineArtifact = baseArtifact({
    id: REFINE_ARTIFACT,
    stage: 'chunk_refine_claims',
    created_at: '2026-01-02T00:00:00.000Z',
    input_claim_version_id: EXTRACTOR_V0,
    output_claim_version_id: REFINER_V1,
    report: {
      refinement_cycle: 1,
      input_claim_version_id: EXTRACTOR_V0,
      output_claim_version_id: REFINER_V1,
      source_review_artifact_id: REVIEW_ARTIFACT,
    },
  })

  return {
    story: {
      story_id: 'story-1',
      friendly_id: 'st_1',
      title: 'Test',
      url: null,
      source_name: null,
      published_at: null,
      scraped_at: null,
      extraction_completed_at: null,
      merged_at: null,
      extraction_skipped_empty: false,
    },
    claims: [],
    evidence: [],
    positions: [],
    events: [],
    links: {
      claim_evidence: [],
      claim_position: [],
      position_evidence: [],
      event_claim: [],
      event_evidence: [],
      position_event_context: [],
    },
    chunks: [
      baseChunk({
        active_claim_version_id: REFINER_V1,
        extraction_qa_status: 'awaiting_approval',
        extraction_qa_refinement_count: 1,
        claim_versions: [
          ...(baseChunk().claim_versions ?? []),
          {
            id: REFINER_V1,
            chunk_index: 0,
            version_number: 1,
            source: 'refiner',
            parent_version_id: EXTRACTOR_V0,
            created_from_review_artifact_id: REVIEW_ARTIFACT,
            review_outcome: null,
            created_at: '2026-01-02T00:00:00.000Z',
            claims_json: { claims: [] },
          },
        ],
        claims_lane_phase: 'awaiting_approval',
        claims_lane_phase_label: 'Awaiting approval',
      }),
    ],
    qa_artifacts: [reviewArtifact, refineArtifact],
    step_runs: {},
    step_run_history: {},
  } as StoryExtractionReviewPayload
}

console.log('happy path lineage')
{
  const payload = happyPathPayload()
  const chunk = payload.chunks[0]
  const lifecycle = assembleChunkLaneLifecycle({
    lane: 'claims',
    chunk,
    chunkIndex: 0,
    stepId: 'refine-chunk-claims',
    payload,
  })

  assert('refiner v1 visible in claim_versions', lifecycle.claimVersions.some((v) => v.version_id === REFINER_V1))
  assert('active_version_id is refiner v1', lifecycle.activeVersionId === REFINER_V1)
  assert('refinement links output v1', lifecycle.refinements[0]?.output_version_id === REFINER_V1)
  assert('lineage includes next_version_id', lifecycle.lineage.some((row) => row.next_version_id === REFINER_V1))
  assert('no hidden refiner versions', lifecycle.hiddenRefinerVersionCount === 0)
  assert('no orphaned versions', lifecycle.orphanedVersions.length === 0)

  const violations = checkChunkExportInvariants({
    stepComplete: true,
    stepCompletedAt: '2026-01-02T00:00:00.000Z',
    stepNextAction: 'run_approver',
    atomStatus: lifecycle.atomStatus,
    reviews: lifecycle.reviews,
    refinements: lifecycle.refinements,
    claimVersions: lifecycle.claimVersions,
    lineage: lifecycle.lineage,
    phase: deriveChunkLanePhase('claims', chunk),
    hiddenRefinerVersionCount: lifecycle.hiddenRefinerVersionCount,
  })
  assert('no invariant violations on happy path', violations.length === 0)
}

console.log('column-only refinement artifact linkage')
{
  const payload = happyPathPayload()
  payload.qa_artifacts = payload.qa_artifacts.map((artifact) =>
    artifact.id === REFINE_ARTIFACT
      ? { ...artifact, report: { refinement_cycle: 1 }, output_claim_version_id: REFINER_V1, input_claim_version_id: EXTRACTOR_V0 }
      : artifact
  )

  const laneArtifacts = filterChunkLaneArtifacts(payload, 0, 'claims')
  const reviews = mergeChunkReviewsExport(laneArtifacts, 'claims', payload.chunks[0], 0, payload)
  const refinements = buildChunkRefinementsExport(laneArtifacts, 'claims', reviews)

  assert('refinement export resolves output from column', refinements[0]?.output_version_id === REFINER_V1)
  assert(
    'refiner v1 visible when column links output',
    filterVisibleClaimVersions(payload.chunks[0].claim_versions ?? [], refinements, REFINER_V1).some(
      (v) => v.id === REFINER_V1
    )
  )
}

console.log('active pointer consistency when artifact missing')
{
  const payload = happyPathPayload()
  payload.qa_artifacts = payload.qa_artifacts.filter((artifact) => artifact.stage !== 'chunk_refine_claims')
  const chunk = payload.chunks[0]
  const phase = deriveChunkLanePhase('claims', chunk)
  const laneArtifacts = filterChunkLaneArtifacts(payload, 0, 'claims')
  const reviews = mergeChunkReviewsExport(laneArtifacts, 'claims', chunk, 0, payload)
  const refinements = buildChunkRefinementsExport(laneArtifacts, 'claims', reviews)
  const visibleVersions = filterVisibleClaimVersions(
    chunk.claim_versions ?? [],
    refinements,
    chunk.active_claim_version_id
  )
  const activeVersionId = resolveExportActiveVersionId({
    lane: 'claims',
    chunk,
    stepId: 'refine-chunk-claims',
    phase,
    reviews,
    refinements,
    visibleVersions,
  })

  assert('export active_version_id trusts DB pointer', activeVersionId === REFINER_V1)
  assert(
    'orphan flagged for missing refinement artifact',
    findOrphanedClaimVersions({
      versions: chunk.claim_versions ?? [],
      artifacts: payload.qa_artifacts,
      activeVersionId: chunk.active_claim_version_id,
      reviews,
    }).some((row) => row.orphan_reasons.includes('missing_refinement_artifact'))
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
