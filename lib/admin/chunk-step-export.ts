import { exportChunkPositionRecords } from '@/lib/admin/chunk-extraction'
import type { ChunkClaimVersionSummary } from '@/lib/admin/chunk-qa-history'
import { orphanedVersionsForChunkExport } from '@/lib/admin/orphaned-claim-versions'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import {
  deriveChunkLanePhase,
  laneForChunkStep,
  type ChunkLanePhase,
} from '@/lib/admin/pipeline-status/chunk-phase'
import {
  MAX_CHUNK_QA_REFINEMENT_ATTEMPTS,
  MAX_CHUNK_QA_VALIDATION_ATTEMPTS,
} from '@/lib/admin/pipeline-status/qa-lane-state'
import { QA_LANE_ARTIFACT_STAGES, type QaLaneId } from '@/lib/admin/pipeline-status/qa-lane-stages'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export type ChunkAtomType = QaLaneId

export type ChunkStepOutcome =
  | 'passed'
  | 'needs_refinement'
  | 'needs_human_review'
  | 'failed_runtime'
  | null

export type ChunkStepNextAction =
  | 'run_review'
  | 'run_refiner'
  | 'run_approver'
  | 'merge_ready'
  | 'human_review'
  | 'stop_max_retries'
  | 'run_extract'
  | null

export const CHUNK_EXPORT_STEP_KEYS: Partial<Record<PipelineStepId, string>> = {
  'extract-story-claims': 'chunk.claims.extract',
  'validate-chunk-claims': 'chunk.claims.review',
  'refine-chunk-claims': 'chunk.claims.refine',
  'approve-chunk-claims': 'chunk.claims.approve',
}

type ChunkRow = StoryExtractionReviewPayload['chunks'][number]
type QaArtifact = StoryExtractionReviewPayload['qa_artifacts'][number]

function artifactInputClaimVersionId(artifact: QaArtifact): string | null {
  return artifact.input_claim_version_id ?? str(asRecord(artifact.report)?.input_claim_version_id)
}

function artifactOutputClaimVersionId(artifact: QaArtifact): string | null {
  return artifact.output_claim_version_id ?? str(asRecord(artifact.report)?.output_claim_version_id)
}

function artifactSourceReviewId(artifact: QaArtifact): string | null {
  return str(asRecord(artifact.report)?.source_review_artifact_id)
}

export type ChunkReviewExport = {
  review_id: string
  review_round: number
  reviewed_version_id: string | null
  outcome: ChunkStepOutcome
  next_action: ChunkStepNextAction
  created_at: string | null
  passes_review: boolean | null
  issues_count: number
  patches_count: number
  issues: unknown[]
  refinement_instruction: string | null
}

export type ChunkRefinementExport = {
  refinement_id: string
  refinement_round: number | null
  input_version_id: string | null
  output_version_id: string | null
  source_review_id: string | null
  created_at: string
}

export type ChunkClaimVersionExport = {
  version_id: string
  version_number: number
  source: 'extractor' | 'refiner'
  parent_version_id: string | null
  created_from_review_id: string | null
  review_outcome: string | null
  status: 'active' | 'superseded'
  created_at: string
  claims_json: unknown
}

export type ChunkLineageExport = {
  version_id: string
  version_label: string
  source: 'extractor' | 'refiner'
  review_id: string | null
  review_outcome: ChunkStepOutcome | string | null
  refinement_id: string | null
  next_version_id: string | null
  is_active: boolean
}

export type ChunkExportViewState = {
  selected_step: string | null
  selected_version_id: string | null
  selected_review_id: string | null
  lifecycle_summary: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

export function resolveChunkAtomType(stepId: PipelineStepId): ChunkAtomType | null {
  return laneForChunkStep(stepId)
}

export function deriveChunkStepOutcome(lane: QaLaneId, chunk: ChunkRow): ChunkStepOutcome {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const status = chunk[stages.qaStatusKey]
  if (status === 'passed' || status === 'atoms_passed') return 'passed'
  if (status === 'needs_refinement') return 'needs_refinement'
  if (status === 'awaiting_approval') return 'needs_refinement'
  if (status === 'needs_human_review') return 'needs_human_review'
  return null
}

export function deriveChunkStepNextAction(
  lane: QaLaneId,
  chunk: ChunkRow,
  stepId: PipelineStepId
): ChunkStepNextAction {
  const phase = deriveChunkLanePhase(lane, chunk)
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const refinementCount = chunk[stages.refinementCountKey] ?? 0
  const validationAttempts = chunk[stages.validationAttemptCountKey] ?? 0

  if (stepId === stages.extractStep) {
    return phase === 'not_started' ? 'run_extract' : null
  }

  if (phase === 'awaiting_review') return 'run_review'
  if (phase === 'awaiting_refine') return 'run_refiner'
  if (phase === 'awaiting_approval') return 'run_approver'
  if (phase === 'complete') return 'merge_ready'

  if (phase === 'needs_human') {
    if (
      refinementCount >= MAX_CHUNK_QA_REFINEMENT_ATTEMPTS ||
      validationAttempts >= MAX_CHUNK_QA_VALIDATION_ATTEMPTS
    ) {
      return 'stop_max_retries'
    }
    return 'human_review'
  }

  return null
}

function laneArtifactStages(lane: QaLaneId): readonly string[] {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  return [
    ...stages.review,
    ...stages.refine,
    ...stages.approve,
    'chunk_extract_claims',
    'chunk_extract',
    'chunk_extract_positions',
  ]
}

export function filterChunkLaneArtifacts(
  payload: StoryExtractionReviewPayload,
  chunkIndex: number,
  lane: QaLaneId
): QaArtifact[] {
  const allowed = new Set(laneArtifactStages(lane))
  return payload.qa_artifacts
    .filter(
      (artifact) =>
        artifact.chunk_index === chunkIndex &&
        allowed.has(artifact.stage) &&
        artifact.reverted_at == null
    )
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    )
}

function isReviewArtifactStage(stage: string, lane: QaLaneId): boolean {
  return (QA_LANE_ARTIFACT_STAGES[lane].review as readonly string[]).includes(stage)
}

function isRefineArtifactStage(stage: string, lane: QaLaneId): boolean {
  return (QA_LANE_ARTIFACT_STAGES[lane].refine as readonly string[]).includes(stage)
}

export function reviewOutcomeFromReport(report: unknown): ChunkStepOutcome {
  const row = asRecord(report)
  if (!row) return null
  const resolved = str(row.resolved_status)
  if (resolved === 'passed' || resolved === 'needs_refinement' || resolved === 'needs_human_review') {
    return resolved
  }
  if (row.passes_review === true) return 'passed'
  const action = str(row.recommended_action)
  if (action === 'needs_refinement' || action === 'refine') return 'needs_refinement'
  if (action === 'human_review' || action === 'reject') return 'needs_human_review'
  if (action === 'validate' || action === 'accept') return 'passed'
  return null
}

function nextActionFromReviewOutcome(outcome: ChunkStepOutcome): ChunkStepNextAction {
  if (outcome === 'passed') return 'merge_ready'
  if (outcome === 'needs_refinement') return 'run_refiner'
  if (outcome === 'needs_human_review') return 'human_review'
  return null
}

function reviewedVersionIdFromReport(report: unknown): string | null {
  const row = asRecord(report)
  return str(row?.reviewed_claim_version_id) ?? str(row?.input_claim_version_id) ?? null
}

function isValidTimestamp(value: string | null | undefined): value is string {
  if (!value?.trim()) return false
  return !Number.isNaN(new Date(value).getTime())
}

function laneValidatedAt(chunk: ChunkRow, lane: QaLaneId): string | null {
  return lane === 'claims' ? chunk.extraction_qa_validated_at : chunk.positions_qa_validated_at
}

function validateStepRunTimestamp(
  payload: StoryExtractionReviewPayload,
  lane: QaLaneId,
  chunkIndex: number,
  reviewRound?: number
): string | null {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const validateStepId = stages.validateStep as PipelineStepId
  const chunkRuns = (payload.step_run_history?.[validateStepId] ?? [])
    .filter((run) => run.chunk_index === chunkIndex)
    .sort(
      (left, right) =>
        new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime()
    )

  if (reviewRound != null && reviewRound > 0) {
    const run = chunkRuns[reviewRound - 1] ?? chunkRuns.at(-1)
    if (run) return run.ended_at ?? run.occurred_at
  }

  const latest = payload.step_runs?.[validateStepId]
  if (latest?.chunk_index === chunkIndex) {
    return latest.ended_at ?? latest.occurred_at
  }

  const lastRun = chunkRuns.at(-1)
  return lastRun?.ended_at ?? lastRun?.occurred_at ?? null
}

function resolveReviewCreatedAt(params: {
  primary: string | null | undefined
  chunk: ChunkRow
  lane: QaLaneId
  chunkIndex: number
  payload: StoryExtractionReviewPayload
  reviewedVersionId: string | null
  reviewRound?: number
}): string | null {
  const { primary, chunk, lane, chunkIndex, payload, reviewedVersionId, reviewRound } = params

  if (isValidTimestamp(primary)) return primary

  const validatedAt = laneValidatedAt(chunk, lane)
  if (isValidTimestamp(validatedAt)) return validatedAt

  const runTimestamp = validateStepRunTimestamp(payload, lane, chunkIndex, reviewRound)
  if (isValidTimestamp(runTimestamp)) return runTimestamp

  if (reviewedVersionId && lane === 'claims') {
    const version = (chunk.claim_versions ?? []).find((row) => row.id === reviewedVersionId)
    if (isValidTimestamp(version?.created_at)) return version!.created_at
  }

  return null
}

function finalizeReviewTimestamps(
  reviews: ChunkReviewExport[],
  chunk: ChunkRow,
  lane: QaLaneId,
  chunkIndex: number,
  payload: StoryExtractionReviewPayload
): ChunkReviewExport[] {
  return reviews.map((review) => ({
    ...review,
    created_at: resolveReviewCreatedAt({
      primary: review.created_at,
      chunk,
      lane,
      chunkIndex,
      payload,
      reviewedVersionId: review.reviewed_version_id,
      reviewRound: review.review_round,
    }),
  }))
}

function normalizeReviewFromArtifact(
  artifact: QaArtifact,
  lane: QaLaneId,
  fallbackRound: number,
  chunk: ChunkRow,
  chunkIndex: number,
  payload: StoryExtractionReviewPayload
): ChunkReviewExport {
  const report = asRecord(artifact.report)
  const outcome = reviewOutcomeFromReport(artifact.report)
  const reviewedVersionId = reviewedVersionIdFromReport(artifact.report)
  const reviewRound =
    typeof report?.attempt_number === 'number' ? report.attempt_number : fallbackRound

  return {
    review_id: artifact.id,
    review_round: reviewRound,
    reviewed_version_id: reviewedVersionId,
    outcome,
    next_action: nextActionFromReviewOutcome(outcome),
    created_at: resolveReviewCreatedAt({
      primary: artifact.created_at,
      chunk,
      lane,
      chunkIndex,
      payload,
      reviewedVersionId,
      reviewRound,
    }),
    passes_review: typeof report?.passes_review === 'boolean' ? report.passes_review : null,
    issues_count: countArray(report?.issues),
    patches_count: countArray(report?.patches),
    issues: Array.isArray(report?.issues) ? report.issues : [],
    refinement_instruction:
      str(report?.refinement_instruction) ?? str(report?.summary) ?? null,
  }
}

function synthesizeReviewFromChunkState(
  chunk: ChunkRow,
  lane: QaLaneId,
  chunkIndex: number,
  payload: StoryExtractionReviewPayload
): ChunkReviewExport | null {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const report = chunk[stages.reviewReportKey]
  if (report == null) return null

  const reportRow = asRecord(report)
  const outcome = reviewOutcomeFromReport(report)
  const reviewedVersionId = reviewedVersionIdFromReport(report)
  const reviewRound = chunk[stages.validationAttemptCountKey] ?? 1

  return {
    review_id: `derived:chunk-${chunkIndex}:review:${reviewRound}`,
    review_round: typeof reportRow?.attempt_number === 'number' ? reportRow.attempt_number : reviewRound,
    reviewed_version_id:
      reviewedVersionId ??
      (lane === 'claims' ? chunk.active_claim_version_id : null),
    outcome,
    next_action: nextActionFromReviewOutcome(outcome),
    created_at: resolveReviewCreatedAt({
      primary: laneValidatedAt(chunk, lane),
      chunk,
      lane,
      chunkIndex,
      payload,
      reviewedVersionId:
        reviewedVersionId ??
        (lane === 'claims' ? chunk.active_claim_version_id : null),
      reviewRound,
    }),
    passes_review: typeof reportRow?.passes_review === 'boolean' ? reportRow.passes_review : null,
    issues_count: countArray(reportRow?.issues),
    patches_count: countArray(reportRow?.patches),
    issues: Array.isArray(reportRow?.issues) ? reportRow.issues : [],
    refinement_instruction:
      str(reportRow?.refinement_instruction) ?? str(reportRow?.summary) ?? null,
  }
}

function syncReviewsWithReport(
  reviews: ChunkReviewExport[],
  chunk: ChunkRow,
  lane: QaLaneId
): ChunkReviewExport[] {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const report = chunk[stages.reviewReportKey]
  const reviewedVersionId =
    reviewedVersionIdFromReport(report) ??
    (lane === 'claims' ? chunk.active_claim_version_id : null)
  if (!reviewedVersionId || reviews.length === 0) return reviews

  return reviews.map((review, index) => {
    if (index !== reviews.length - 1) return review
    return { ...review, reviewed_version_id: reviewedVersionId }
  })
}

export function mergeChunkReviewsExport(
  artifacts: QaArtifact[],
  lane: QaLaneId,
  chunk: ChunkRow,
  chunkIndex: number,
  payload: StoryExtractionReviewPayload
): ChunkReviewExport[] {
  const fromArtifacts = artifacts
    .filter((artifact) => isReviewArtifactStage(artifact.stage, lane))
    .map((artifact, index) =>
      normalizeReviewFromArtifact(artifact, lane, index + 1, chunk, chunkIndex, payload)
    )

  let reviews: ChunkReviewExport[]
  if (fromArtifacts.length === 0) {
    const synthesized = synthesizeReviewFromChunkState(chunk, lane, chunkIndex, payload)
    reviews = synthesized ? [synthesized] : []
  } else {
    const synced = syncReviewsWithReport(fromArtifacts, chunk, lane)
    const report = chunk[QA_LANE_ARTIFACT_STAGES[lane].reviewReportKey]
    const reviewedVersionId = reviewedVersionIdFromReport(report)

    if (reviewedVersionId == null) {
      reviews = synced
    } else {
      const hasReviewForVersion = synced.some(
        (review) => review.reviewed_version_id === reviewedVersionId
      )
      if (hasReviewForVersion) {
        reviews = synced
      } else {
        const synthesized = synthesizeReviewFromChunkState(chunk, lane, chunkIndex, payload)
        reviews = synthesized
          ? [...synced, synthesized].sort((left, right) => {
              const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0
              const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0
              return leftTime - rightTime
            })
          : synced
      }
    }
  }

  return finalizeReviewTimestamps(reviews, chunk, lane, chunkIndex, payload)
}

export function buildChunkRefinementsExport(
  artifacts: QaArtifact[],
  lane: QaLaneId,
  reviews: ChunkReviewExport[]
): ChunkRefinementExport[] {
  return artifacts
    .filter((artifact) => isRefineArtifactStage(artifact.stage, lane))
    .map((artifact) => {
      const report = asRecord(artifact.report)
      const inputVersionId = artifactInputClaimVersionId(artifact)
      const outputVersionId = artifactOutputClaimVersionId(artifact)
      const sourceReview =
        (inputVersionId
          ? reviews.find((review) => review.reviewed_version_id === inputVersionId) ?? null
          : null) ??
        (artifactSourceReviewId(artifact)
          ? reviews.find((review) => review.review_id === artifactSourceReviewId(artifact)) ?? null
          : null)

      return {
        refinement_id: artifact.id,
        refinement_round:
          typeof report?.refinement_cycle === 'number' ? report.refinement_cycle : null,
        input_version_id: inputVersionId,
        output_version_id: outputVersionId,
        source_review_id: sourceReview?.review_id ?? artifactSourceReviewId(artifact),
        created_at: artifact.created_at,
      }
    })
}

export function filterVisibleClaimVersions(
  versions: ChunkClaimVersionSummary[],
  refinements: ChunkRefinementExport[],
  activeClaimVersionId: string | null = null
): ChunkClaimVersionSummary[] {
  const refinedOutputIds = new Set(
    refinements.map((refinement) => refinement.output_version_id).filter(Boolean) as string[]
  )

  return versions.filter((version) => {
    if (version.source === 'extractor') return true
    if (version.id === activeClaimVersionId) return true
    return refinedOutputIds.has(version.id)
  })
}

function reviewIdForVersion(
  versionId: string | null,
  reviews: ChunkReviewExport[]
): string | null {
  if (!versionId) return null
  const matches = reviews.filter((review) => review.reviewed_version_id === versionId)
  return matches.at(-1)?.review_id ?? null
}

export function resolveExportActiveVersionId(params: {
  lane: QaLaneId
  chunk: ChunkRow
  stepId: PipelineStepId
  phase: ChunkLanePhase
  reviews: ChunkReviewExport[]
  refinements: ChunkRefinementExport[]
  visibleVersions: ChunkClaimVersionSummary[]
}): string | null {
  const { lane, chunk, stepId, phase, reviews, refinements, visibleVersions } = params
  if (lane !== 'claims') return null

  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const report = chunk[stages.reviewReportKey]
  const reviewedFromReport = reviewedVersionIdFromReport(report)
  const latestReview = reviews.at(-1) ?? null

  const preRefineReviewPending =
    phase === 'awaiting_refine' &&
    refinements.length === 0 &&
    (deriveChunkStepOutcome(lane, chunk) === 'needs_refinement' ||
      latestReview?.outcome === 'needs_refinement')

  if (preRefineReviewPending || stepId === stages.validateStep) {
    const reviewedVersionId =
      reviewedFromReport ??
      latestReview?.reviewed_version_id ??
      visibleVersions.find((version) => version.source === 'extractor')?.id ??
      null

    if (preRefineReviewPending && reviewedVersionId) {
      return reviewedVersionId
    }
  }

  const active = chunk.active_claim_version_id
  const allVersions = chunk.claim_versions ?? []
  if (active && allVersions.some((version) => version.id === active)) {
    if (visibleVersions.some((version) => version.id === active)) {
      return active
    }
    const postRefinePhases: ChunkLanePhase[] = ['awaiting_approval', 'merge_ready', 'complete']
    if (postRefinePhases.includes(phase)) {
      return active
    }
  }

  return visibleVersions.at(-1)?.id ?? active ?? null
}

export function buildClaimVersionsExport(params: {
  versions: ChunkClaimVersionSummary[]
  activeVersionId: string | null
  reviews: ChunkReviewExport[]
  refinements: ChunkRefinementExport[]
}): ChunkClaimVersionExport[] {
  const { versions, activeVersionId, reviews, refinements } = params

  return versions.map((version) => {
    const createdFromReviewId =
      version.source === 'refiner'
        ? (version.created_from_review_artifact_id ??
          (version.parent_version_id
            ? reviewIdForVersion(version.parent_version_id, reviews) ??
              refinements.find((refinement) => refinement.output_version_id === version.id)
                ?.source_review_id ??
              null
            : null))
        : null

    return {
      version_id: version.id,
      version_number: version.version_number,
      source: version.source,
      parent_version_id: version.parent_version_id,
      created_from_review_id: createdFromReviewId,
      review_outcome: version.review_outcome,
      status: version.id === activeVersionId ? 'active' : 'superseded',
      created_at: version.created_at,
      claims_json: version.claims_json,
    }
  })
}

export function buildChunkLineageExport(params: {
  claimVersions: ChunkClaimVersionExport[]
  reviews: ChunkReviewExport[]
  refinements: ChunkRefinementExport[]
  activeVersionId: string | null
}): ChunkLineageExport[] {
  const { claimVersions, reviews, refinements, activeVersionId } = params

  return claimVersions.map((version) => {
    const review = reviews.find((row) => row.reviewed_version_id === version.version_id) ?? null
    const refinement =
      refinements.find((row) => row.input_version_id === version.version_id) ?? null
    const nextVersionId = refinement?.output_version_id ?? null

    return {
      version_id: version.version_id,
      version_label: `v${version.version_number}`,
      source: version.source,
      review_id: review?.review_id ?? reviewIdForVersion(version.version_id, reviews),
      review_outcome: review?.outcome ?? version.review_outcome ?? null,
      refinement_id: refinement?.refinement_id ?? null,
      next_version_id: nextVersionId,
      is_active: version.version_id === activeVersionId,
    }
  })
}

export function buildChunkAtomStatus(params: {
  lane: QaLaneId
  chunk: ChunkRow
  reviews: ChunkReviewExport[]
  activeVersionId: string | null
  stepId: PipelineStepId
}): {
  atom_type: QaLaneId
  has_extractor_output: boolean
  active_version_id: string | null
  active_version_number: number | null
  latest_review_id: string | null
  latest_review_exists: boolean
  latest_reviewed_version_id: string | null
  latest_review_outcome: ChunkStepOutcome
  review_round: number
  refinement_round: number
  next_action: ChunkStepNextAction
} {
  const { lane, chunk, reviews, activeVersionId, stepId } = params
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const report = chunk[stages.reviewReportKey]
  const reviewedFromReport = reviewedVersionIdFromReport(report)
  const latestReview = reviews.at(-1) ?? null
  const reviewExists = report != null || reviews.length > 0
  const latestReviewedVersionId =
    reviewedFromReport ??
    latestReview?.reviewed_version_id ??
    (reviewExists && lane === 'claims' ? activeVersionId : null)
  const latestReviewId = latestReview?.review_id ?? null

  return {
    atom_type: lane,
    has_extractor_output: chunk[stages.extractionJsonKey] != null,
    active_version_id: lane === 'claims' ? activeVersionId : null,
    active_version_number:
      lane === 'claims'
        ? ((chunk.claim_versions ?? []).find((version) => version.id === activeVersionId)
            ?.version_number ?? null)
        : null,
    latest_review_id: latestReviewId,
    latest_review_exists: reviewExists,
    latest_reviewed_version_id: latestReviewedVersionId,
    latest_review_outcome:
      latestReview?.outcome ?? reviewOutcomeFromReport(report) ?? deriveChunkStepOutcome(lane, chunk),
    review_round: chunk[stages.validationAttemptCountKey] ?? 0,
    refinement_round: chunk[stages.refinementCountKey] ?? 0,
    next_action: deriveChunkStepNextAction(lane, chunk, stepId),
  }
}

export function buildChunkExportViewState(params: {
  stepId: PipelineStepId
  exportStepKey: string | null
  activeVersionId: string | null
  reviews: ChunkReviewExport[]
  lineage: ChunkLineageExport[]
  phase: ChunkLanePhase
  nextAction: ChunkStepNextAction
}): ChunkExportViewState {
  const { stepId, exportStepKey, activeVersionId, reviews, lineage, phase, nextAction } = params
  const activeLine = lineage.find((row) => row.is_active) ?? null
  const reviewForActive =
    reviews.filter((review) => review.reviewed_version_id === activeVersionId).at(-1)
      ?.review_id ??
    activeLine?.review_id ??
    reviews.at(-1)?.review_id ??
    null

  let lifecycleSummary: string | null = null
  const activeLabel = activeLine?.version_label ?? null
  if (activeLabel) {
    if (phase === 'awaiting_refine' || nextAction === 'run_refiner') {
      lifecycleSummary = `${activeLabel} ${activeLine?.source ?? 'extractor'} → review failed → awaiting refiner`
    } else if (phase === 'awaiting_review' || nextAction === 'run_review') {
      lifecycleSummary = `${activeLabel} ${activeLine?.source ?? 'refiner'} active → awaiting review`
    } else if (phase === 'complete' || nextAction === 'merge_ready') {
      lifecycleSummary = `${activeLabel} passed review → merge ready`
    }
  }

  return {
    selected_step: exportStepKey ?? stepId,
    selected_version_id: activeVersionId,
    selected_review_id: reviewForActive,
    lifecycle_summary: lifecycleSummary,
  }
}

export function getChunkStepCompletedAt(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  chunkIndex: number,
  chunk: ChunkRow,
  lane: QaLaneId,
  reviews: ChunkReviewExport[]
): string | null {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]

  const stepStages =
    stepId === stages.extractStep
      ? (['chunk_extract_claims', 'chunk_extract', 'chunk_extract_positions'] as const)
      : stepId === stages.validateStep
        ? stages.review
        : stepId === stages.refineStep
          ? stages.refine
          : []

  let latest: string | null = null
  for (const artifact of payload.qa_artifacts) {
    if (artifact.chunk_index !== chunkIndex) continue
    if (!stepStages.includes(artifact.stage)) continue
    if (artifact.reverted_at != null) continue
    if (!latest || new Date(artifact.created_at).getTime() > new Date(latest).getTime()) {
      latest = artifact.created_at
    }
  }

  if (stepId === stages.validateStep) {
    const validatedAt =
      lane === 'claims' ? chunk.extraction_qa_validated_at : chunk.positions_qa_validated_at
    if (validatedAt && (!latest || new Date(validatedAt).getTime() > new Date(latest).getTime())) {
      latest = validatedAt
    }
    const reviewCreatedAt = reviews.at(-1)?.created_at
    if (
      reviewCreatedAt &&
      (!latest || new Date(reviewCreatedAt).getTime() > new Date(latest).getTime())
    ) {
      latest = reviewCreatedAt
    }
  }

  if (stepId === stages.refineStep) {
    const refineArtifacts = payload.qa_artifacts.filter(
      (artifact) =>
        artifact.chunk_index === chunkIndex &&
        (stages.refine as readonly string[]).includes(artifact.stage) &&
        artifact.reverted_at == null
    )
    const refineLatest = refineArtifacts.at(-1)?.created_at ?? null
    if (
      refineLatest &&
      (!latest || new Date(refineLatest).getTime() > new Date(latest).getTime())
    ) {
      latest = refineLatest
    }
  }

  return latest
}

export function getChunkStepExportOutput(
  stepId: PipelineStepId,
  chunk: ChunkRow,
  lane: QaLaneId,
  atomStatus: ReturnType<typeof buildChunkAtomStatus>
): Record<string, unknown> {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]

  if (stepId === stages.extractStep) {
    const extraction = chunk[stages.extractionJsonKey]
    return {
      atom_type: lane,
      has_extractor_output: extraction != null,
      extraction_json: extraction,
      positions:
        lane === 'positions'
          ? exportChunkPositionRecords(chunk.positions_extraction_json)
          : undefined,
    }
  }

  if (stepId === stages.validateStep) {
    const reviewReport = chunk[stages.reviewReportKey]
    return {
      atom_type: lane,
      active_version_id: atomStatus.active_version_id,
      latest_review_outcome: atomStatus.latest_review_outcome,
      next_action: deriveChunkStepNextAction(lane, chunk, stepId),
      review_report: reviewReport,
      validation_report:
        lane === 'claims'
          ? chunk.extraction_qa_validation_report
          : chunk.positions_qa_validation_report,
    }
  }

  if (stepId === stages.refineStep) {
    return {
      atom_type: lane,
      active_version_id: atomStatus.active_version_id,
      refinement_round: atomStatus.refinement_round,
      next_action: deriveChunkStepNextAction(lane, chunk, stepId),
      extraction_json: chunk[stages.extractionJsonKey],
    }
  }

  return {
    atom_type: lane,
    next_action: deriveChunkStepNextAction(lane, chunk, stepId),
  }
}

export function checkChunkExportInvariants(params: {
  stepComplete: boolean
  stepCompletedAt: string | null
  stepNextAction: ChunkStepNextAction
  atomStatus: ReturnType<typeof buildChunkAtomStatus>
  reviews: ChunkReviewExport[]
  refinements: ChunkRefinementExport[]
  claimVersions: ChunkClaimVersionExport[]
  lineage: ChunkLineageExport[]
  phase: ChunkLanePhase
  hiddenRefinerVersionCount?: number
}): string[] {
  const violations: string[] = []
  const {
    stepComplete,
    stepCompletedAt,
    stepNextAction,
    atomStatus,
    reviews,
    refinements,
    claimVersions,
    lineage,
    phase,
    hiddenRefinerVersionCount = 0,
  } = params

  if (atomStatus.latest_review_exists && reviews.length === 0) {
    violations.push('review exists but reviews array is empty')
  }

  for (const review of reviews) {
    if (!review.created_at) {
      violations.push(`review ${review.review_id} is missing created_at`)
    }
  }

  if (atomStatus.latest_review_exists && !atomStatus.latest_review_id) {
    violations.push('latest_review_exists is true but latest_review_id is null')
  }

  if (atomStatus.latest_review_exists && !atomStatus.latest_reviewed_version_id) {
    violations.push('latest_review_exists is true but latest_reviewed_version_id is null')
  }

  if (stepComplete && !stepCompletedAt) {
    violations.push('step.complete is true but step.completed_at is null')
  }

  for (const version of claimVersions) {
    if (version.source === 'refiner' && !version.created_from_review_id) {
      violations.push(
        `refiner version ${version.version_id} is missing created_from_review_id`
      )
    }
  }

  const activeRefinerVersion = claimVersions.find(
    (version) => version.source === 'refiner' && version.status === 'active'
  )
  if (stepNextAction === 'run_refiner' && activeRefinerVersion) {
    violations.push(
      'next_action is run_refiner but an active refiner-created version already exists'
    )
  }

  for (const row of lineage) {
    if (!row.next_version_id) continue
    const refinement = refinements.find(
      (item) =>
        item.input_version_id === row.version_id &&
        item.output_version_id === row.next_version_id
    )
    if (!refinement) {
      violations.push(
        `lineage next_version_id ${row.next_version_id} has no matching refinement artifact`
      )
    }
  }

  if (hiddenRefinerVersionCount > 0) {
    violations.push(
      `${hiddenRefinerVersionCount} refiner version(s) are omitted from lineage; see orphaned_versions for details and cleanup actions`
    )
  }

  return violations
}

export function assembleChunkLaneLifecycle(params: {
  lane: QaLaneId
  chunk: ChunkRow
  chunkIndex: number
  stepId: PipelineStepId
  payload: StoryExtractionReviewPayload
}) {
  const { lane, chunk, chunkIndex, stepId, payload } = params
  const phase = deriveChunkLanePhase(lane, chunk)
  const laneArtifacts = filterChunkLaneArtifacts(payload, chunkIndex, lane)
  const reviews = mergeChunkReviewsExport(laneArtifacts, lane, chunk, chunkIndex, payload)
  const refinements = buildChunkRefinementsExport(laneArtifacts, lane, reviews)

  const allVersions = chunk.claim_versions ?? []
  const visibleVersions = filterVisibleClaimVersions(
    allVersions,
    refinements,
    chunk.active_claim_version_id
  )
  const hiddenRefinerVersionCount = allVersions.filter(
    (version) => version.source === 'refiner' && !visibleVersions.some((row) => row.id === version.id)
  ).length

  const activeVersionId = resolveExportActiveVersionId({
    lane,
    chunk,
    stepId,
    phase,
    reviews,
    refinements,
    visibleVersions,
  })

  const claimVersions =
    lane === 'claims'
      ? buildClaimVersionsExport({
          versions: visibleVersions,
          activeVersionId,
          reviews,
          refinements,
        })
      : []

  const lineage =
    lane === 'claims'
      ? buildChunkLineageExport({
          claimVersions,
          reviews,
          refinements,
          activeVersionId,
        })
      : []

  const atomStatus = buildChunkAtomStatus({
    lane,
    chunk,
    reviews,
    activeVersionId,
    stepId,
  })

  const exportStepKey = CHUNK_EXPORT_STEP_KEYS[stepId] ?? null
  const nextAction = deriveChunkStepNextAction(lane, chunk, stepId)
  const viewState = buildChunkExportViewState({
    stepId,
    exportStepKey,
    activeVersionId,
    reviews,
    lineage,
    phase,
    nextAction,
  })

  const visibleVersionIds = new Set(visibleVersions.map((version) => version.id))
  const laneArtifactsAll = payload.qa_artifacts.filter(
    (artifact) => artifact.chunk_index === chunkIndex && artifact.reverted_at == null
  )
  const orphanedVersions =
    lane === 'claims'
      ? orphanedVersionsForChunkExport({
          allVersions: allVersions,
          visibleVersionIds,
          artifacts: laneArtifactsAll,
          activeVersionId: chunk.active_claim_version_id,
          reviews,
        })
      : []

  return {
    phase,
    reviews,
    refinements,
    claimVersions,
    lineage,
    atomStatus,
    activeVersionId,
    viewState,
    hiddenRefinerVersionCount,
    orphanedVersions,
  }
}
