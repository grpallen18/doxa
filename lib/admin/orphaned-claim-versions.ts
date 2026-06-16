import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChunkClaimVersionSummary } from '@/lib/admin/chunk-qa-history'
import type { ChunkRefinementExport, ChunkReviewExport } from '@/lib/admin/chunk-step-export'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export type OrphanedClaimVersionReason =
  | 'missing_refinement_artifact'
  | 'missing_created_from_review_artifact_id'
  | 'active_but_unlinked'
  | 'unpromoted_refiner_output'

export type OrphanedClaimVersionRow = {
  version_id: string
  version_number: number
  version_label: string
  source: 'refiner'
  parent_version_id: string | null
  created_from_review_artifact_id: string | null
  created_at: string
  is_active: boolean
  orphan_reasons: OrphanedClaimVersionReason[]
  refinement_artifact_id: string | null
  suggested_review_artifact_id: string | null
  suggested_actions: Array<'delete' | 'relink'>
}

type QaArtifact = StoryExtractionReviewPayload['qa_artifacts'][number] & {
  claim_version_id?: string | null
  input_claim_version_id?: string | null
  output_claim_version_id?: string | null
}

export type ChunkLifecycleIssueKind = 'stale_refinement_counter'

export type ChunkLifecycleIssue = {
  kind: ChunkLifecycleIssueKind
  message: string
  suggested_actions: Array<'reset_refinement_counter'>
}

export type ChunkClaimsLifecycleSnapshot = {
  orphaned_versions: OrphanedClaimVersionRow[]
  lifecycle_issues: ChunkLifecycleIssue[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

const REFINE_STAGES = new Set(['chunk_refine_claims', 'chunk_refine'])
const REVIEW_STAGES = new Set(['chunk_review_claims', 'chunk_review', 'chunk_validate'])

export type ClaimVersionWithReviewLink = ChunkClaimVersionSummary & {
  created_from_review_artifact_id?: string | null
  run_id?: string | null
}

function refinementArtifactForOutput(
  artifacts: QaArtifact[],
  outputVersionId: string
): QaArtifact | null {
  for (let i = artifacts.length - 1; i >= 0; i -= 1) {
    const artifact = artifacts[i]
    if (artifact.reverted_at != null) continue
    if (!REFINE_STAGES.has(artifact.stage)) continue
    if (artifact.output_claim_version_id === outputVersionId) return artifact
    const report = asRecord(artifact.report)
    if (str(report?.output_claim_version_id) === outputVersionId) return artifact
  }
  return null
}

function reviewArtifactForParentVersion(
  artifacts: QaArtifact[],
  parentVersionId: string
): QaArtifact | null {
  for (let i = artifacts.length - 1; i >= 0; i -= 1) {
    const artifact = artifacts[i]
    if (artifact.reverted_at != null) continue
    if (!REVIEW_STAGES.has(artifact.stage)) continue
    if (artifact.claim_version_id === parentVersionId) return artifact
    const report = asRecord(artifact.report)
    const reviewedId =
      str(report?.reviewed_claim_version_id) ?? str(report?.input_claim_version_id)
    if (reviewedId === parentVersionId) return artifact
  }
  return null
}

function countLinkedRefinementOutputs(artifacts: QaArtifact[]): number {
  const outputs = new Set<string>()
  for (const artifact of artifacts) {
    if (artifact.reverted_at != null) continue
    if (!REFINE_STAGES.has(artifact.stage)) continue
    const outputId =
      artifact.output_claim_version_id ??
      str(asRecord(artifact.report)?.output_claim_version_id)
    if (outputId) outputs.add(outputId)
  }
  return outputs.size
}

export function findChunkLifecycleIssues(params: {
  refinementCount: number
  artifacts: QaArtifact[]
  orphans: OrphanedClaimVersionRow[]
}): ChunkLifecycleIssue[] {
  const linkedCount = countLinkedRefinementOutputs(params.artifacts)
  if (params.orphans.length > 0 || params.refinementCount <= linkedCount) {
    return []
  }

  return [
    {
      kind: 'stale_refinement_counter',
      message: `Refinement counter is ${params.refinementCount} but only ${linkedCount} linked refinement output(s) exist. A prior refine likely timed out or was auto-cleaned.`,
      suggested_actions: ['reset_refinement_counter'],
    },
  ]
}

export function analyzeChunkClaimsLifecycle(params: {
  versions: ClaimVersionWithReviewLink[]
  artifacts: QaArtifact[]
  activeVersionId: string | null
  refinementCount: number
  reviews?: ChunkReviewExport[]
}): ChunkClaimsLifecycleSnapshot {
  const orphaned_versions = findOrphanedClaimVersions({
    versions: params.versions,
    artifacts: params.artifacts,
    activeVersionId: params.activeVersionId,
    reviews: params.reviews,
  })

  const lifecycle_issues = findChunkLifecycleIssues({
    refinementCount: params.refinementCount,
    artifacts: params.artifacts,
    orphans: orphaned_versions,
  })

  return { orphaned_versions, lifecycle_issues }
}

export function findOrphanedClaimVersions(params: {
  versions: ClaimVersionWithReviewLink[]
  artifacts: QaArtifact[]
  activeVersionId: string | null
  reviews?: ChunkReviewExport[]
}): OrphanedClaimVersionRow[] {
  const { versions, artifacts, activeVersionId, reviews = [] } = params
  const orphans: OrphanedClaimVersionRow[] = []

  for (const version of versions) {
    if (version.source !== 'refiner') continue

    const refinementArtifact = refinementArtifactForOutput(artifacts, version.id)
    const reasons: OrphanedClaimVersionReason[] = []

    if (!refinementArtifact) {
      reasons.push('missing_refinement_artifact')
    }

    if (!version.created_from_review_artifact_id) {
      reasons.push('missing_created_from_review_artifact_id')
    }

    const isActive = version.id === activeVersionId
    if (isActive && reasons.length > 0) {
      reasons.push('active_but_unlinked')
    }

    if (refinementArtifact && !isActive) {
      reasons.push('unpromoted_refiner_output')
    }

    if (reasons.length === 0) continue

    const suggestedReviewId =
      version.parent_version_id != null
        ? (reviewArtifactForParentVersion(artifacts, version.parent_version_id)?.id ??
          reviews.find((review) => review.reviewed_version_id === version.parent_version_id)
            ?.review_id ??
          null)
        : null

    const suggestedActions: Array<'delete' | 'relink'> = []
    if (!isActive) suggestedActions.push('delete')
    suggestedActions.push('relink')

    orphans.push({
      version_id: version.id,
      version_number: version.version_number,
      version_label: `v${version.version_number}`,
      source: 'refiner',
      parent_version_id: version.parent_version_id,
      created_from_review_artifact_id: version.created_from_review_artifact_id ?? null,
      created_at: version.created_at,
      is_active: isActive,
      orphan_reasons: reasons,
      refinement_artifact_id: refinementArtifact?.id ?? null,
      suggested_review_artifact_id: suggestedReviewId,
      suggested_actions: suggestedActions,
    })
  }

  return orphans
}

export function findOrphanedClaimVersionsFromPayload(
  payload: StoryExtractionReviewPayload,
  chunkIndex: number
): OrphanedClaimVersionRow[] {
  const chunk = payload.chunks.find((row) => row.chunk_index === chunkIndex)
  if (!chunk) return []

  const artifacts = payload.qa_artifacts.filter(
    (artifact) => artifact.chunk_index === chunkIndex && artifact.reverted_at == null
  )

  return findOrphanedClaimVersions({
    versions: chunk.claim_versions ?? [],
    artifacts,
    activeVersionId: chunk.active_claim_version_id,
  })
}

export async function fetchOrphanedClaimVersions(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<OrphanedClaimVersionRow[]> {
  const snapshot = await fetchChunkClaimsLifecycle(supabase, storyId, chunkIndex)
  return snapshot.orphaned_versions
}

export async function fetchChunkClaimsLifecycle(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<ChunkClaimsLifecycleSnapshot> {
  const [versionsRes, artifactsRes, chunkRes] = await Promise.all([
    supabase
      .from('chunk_claim_versions')
      .select(
        'id, chunk_index, version_number, source, parent_version_id, created_from_review_artifact_id, review_outcome, created_at, claims_json'
      )
      .eq('story_id', storyId)
      .eq('chunk_index', chunkIndex)
      .order('version_number', { ascending: true }),
    supabase
      .from('story_extraction_qa_artifacts')
      .select(
        'id, stage, chunk_index, report, output_snapshot, reverted_at, created_at, claim_version_id, input_claim_version_id, output_claim_version_id'
      )
      .eq('story_id', storyId)
      .eq('chunk_index', chunkIndex)
      .is('reverted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('story_chunks')
      .select('active_claim_version_id, extraction_qa_refinement_count')
      .eq('story_id', storyId)
      .eq('chunk_index', chunkIndex)
      .maybeSingle(),
  ])

  if (versionsRes.error) throw versionsRes.error
  if (artifactsRes.error) throw artifactsRes.error
  if (chunkRes.error) throw chunkRes.error

  const versions: ClaimVersionWithReviewLink[] = (versionsRes.data ?? []).map((row) => ({
    id: String(row.id),
    chunk_index: chunkIndex,
    version_number: Number(row.version_number),
    source: row.source === 'refiner' ? 'refiner' : 'extractor',
    parent_version_id: str(row.parent_version_id),
    created_from_review_artifact_id: str(row.created_from_review_artifact_id),
    review_outcome: str(row.review_outcome),
    created_at: String(row.created_at),
    claims_json: row.claims_json,
  }))

  const artifacts: QaArtifact[] = (artifactsRes.data ?? []).map((row) => ({
    id: String(row.id),
    stage: String(row.stage),
    chunk_index: chunkIndex,
    input_snapshot: null,
    output_snapshot: row.output_snapshot ?? null,
    report: row.report,
    run_id: null,
    created_at: String(row.created_at),
    reverted_at: null,
    claim_version_id: str(row.claim_version_id),
    input_claim_version_id: str(row.input_claim_version_id),
    output_claim_version_id: str(row.output_claim_version_id),
  }))

  return analyzeChunkClaimsLifecycle({
    versions,
    artifacts,
    activeVersionId: str(chunkRes.data?.active_claim_version_id),
    refinementCount: Number(chunkRes.data?.extraction_qa_refinement_count ?? 0),
  })
}

export async function resetStaleChunkRefinementCounter(
  supabase: SupabaseClient,
  params: {
    storyId: string
    chunkIndex: number
  }
): Promise<{ refinement_count: number; qa_status: string | null }> {
  const snapshot = await fetchChunkClaimsLifecycle(supabase, params.storyId, params.chunkIndex)
  if (snapshot.orphaned_versions.length > 0) {
    throw new Error('Relink or delete orphaned refiner versions before resetting the counter')
  }
  if (snapshot.lifecycle_issues.length === 0) {
    throw new Error('Refinement counter is already consistent with linked artifacts')
  }

  const { data: chunk, error: chunkError } = await supabase
    .from('story_chunks')
    .select('extraction_qa_status, extraction_qa_review_report')
    .eq('story_id', params.storyId)
    .eq('chunk_index', params.chunkIndex)
    .maybeSingle()

  if (chunkError) throw chunkError
  if (!chunk) throw new Error('Chunk not found')

  const { data: artifacts, error: artifactsError } = await supabase
    .from('story_extraction_qa_artifacts')
    .select('stage, report, reverted_at, output_claim_version_id')
    .eq('story_id', params.storyId)
    .eq('chunk_index', params.chunkIndex)
    .is('reverted_at', null)

  if (artifactsError) throw artifactsError

  const artifactRows: QaArtifact[] = (artifacts ?? []).map((row) => ({
    id: '',
    stage: String(row.stage),
    chunk_index: params.chunkIndex,
    input_snapshot: null,
    output_snapshot: null,
    report: row.report,
    run_id: null,
    created_at: '',
    reverted_at: null,
    output_claim_version_id: str(row.output_claim_version_id),
  }))

  const linkedCount = countLinkedRefinementOutputs(artifactRows)
  const report = asRecord(chunk.extraction_qa_review_report)
  const resolvedStatus = str(report?.resolved_status)
  const reviewRequestsRefine =
    resolvedStatus === 'needs_refinement' ||
    str(report?.recommended_action) === 'needs_refinement' ||
    str(report?.recommended_action) === 'refine'
  const nextStatus =
    linkedCount === 0 && reviewRequestsRefine
      ? 'needs_refinement'
      : str(chunk.extraction_qa_status)

  const { error: updateError } = await supabase
    .from('story_chunks')
    .update({
      extraction_qa_refinement_count: linkedCount,
      ...(nextStatus ? { extraction_qa_status: nextStatus } : {}),
    })
    .eq('story_id', params.storyId)
    .eq('chunk_index', params.chunkIndex)

  if (updateError) throw updateError

  return {
    refinement_count: linkedCount,
    qa_status: nextStatus,
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

type ChunkQaRow = {
  active_claim_version_id: string | null
  extraction_json: unknown
  extraction_qa_status: string | null
  extraction_qa_refinement_count: number
  extraction_qa_review_report: unknown
}

async function loadChunkQaState(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<ChunkQaRow> {
  const { data, error } = await supabase
    .from('story_chunks')
    .select(
      'active_claim_version_id, extraction_json, extraction_qa_status, extraction_qa_refinement_count, extraction_qa_review_report'
    )
    .eq('story_id', storyId)
    .eq('chunk_index', chunkIndex)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Chunk not found')

  return {
    active_claim_version_id: str(data.active_claim_version_id),
    extraction_json: data.extraction_json,
    extraction_qa_status: str(data.extraction_qa_status),
    extraction_qa_refinement_count: Number(data.extraction_qa_refinement_count ?? 0),
    extraction_qa_review_report: data.extraction_qa_review_report,
  }
}

async function resolveReviewArtifactId(
  supabase: SupabaseClient,
  params: {
    storyId: string
    chunkIndex: number
    parentVersionId: string | null
    requestedId?: string | null
    artifactRows: QaArtifact[]
    reviewReport: unknown
  }
): Promise<string | null> {
  if (isUuid(params.requestedId)) {
    return params.requestedId
  }

  if (params.parentVersionId) {
    const fromRows = reviewArtifactForParentVersion(
      params.artifactRows,
      params.parentVersionId
    )?.id
    if (fromRows) return fromRows

    const { data: byClaimVersion, error: byClaimVersionError } = await supabase
      .from('story_extraction_qa_artifacts')
      .select('id')
      .eq('story_id', params.storyId)
      .eq('chunk_index', params.chunkIndex)
      .eq('stage', 'chunk_review_claims')
      .eq('claim_version_id', params.parentVersionId)
      .is('reverted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (byClaimVersionError) throw byClaimVersionError
    if (byClaimVersion?.id) return String(byClaimVersion.id)

    const { data: reviewArtifacts, error: reviewArtifactsError } = await supabase
      .from('story_extraction_qa_artifacts')
      .select('id, report')
      .eq('story_id', params.storyId)
      .eq('chunk_index', params.chunkIndex)
      .eq('stage', 'chunk_review_claims')
      .is('reverted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)

    if (reviewArtifactsError) throw reviewArtifactsError

    const byReport = (reviewArtifacts ?? []).find((row) => {
      const report = asRecord(row.report)
      const reviewedId =
        str(report?.reviewed_claim_version_id) ?? str(report?.input_claim_version_id)
      return reviewedId === params.parentVersionId
    })
    if (byReport?.id) return String(byReport.id)
  }

  if (params.parentVersionId && params.reviewReport != null) {
    const parentVersion = await loadClaimVersion(supabase, params.parentVersionId)
    const { data: backfilled, error: backfillError } = await supabase
      .from('story_extraction_qa_artifacts')
      .insert({
        story_id: params.storyId,
        chunk_index: params.chunkIndex,
        stage: 'chunk_review_claims',
        input_snapshot: parentVersion.claims_json,
        report: params.reviewReport,
        claim_version_id: params.parentVersionId,
      })
      .select('id')
      .single()

    if (backfillError) throw backfillError
    if (backfilled?.id) return String(backfilled.id)
  }

  return null
}

async function ensureRefinementArtifact(
  supabase: SupabaseClient,
  params: {
    storyId: string
    chunkIndex: number
    version: ClaimVersionWithReviewLink & { story_id: string; chunk_index: number }
    parentVersionId: string
    parentClaimsJson: unknown
    refinementRound: number
    requestedId?: string | null
    artifactRows: QaArtifact[]
    runId?: string | null
  }
): Promise<string> {
  const existingId =
    (isUuid(params.requestedId) ? params.requestedId : null) ??
    refinementArtifactForOutput(params.artifactRows, params.version.id)?.id ??
    null

  const report = {
    refinement_cycle: params.refinementRound,
    patches: [],
    ignored_findings: [],
    post_refine_gate: { passes: true, admin_relinked: true },
    unresolved_blocking: [],
    input_claim_version_id: params.parentVersionId,
    output_claim_version_id: params.version.id,
    admin_relinked: true,
  }

  if (existingId) {
    const { error } = await supabase
      .from('story_extraction_qa_artifacts')
      .update({
        input_snapshot: params.parentClaimsJson,
        output_snapshot: params.version.claims_json,
        report,
        input_claim_version_id: params.parentVersionId,
        output_claim_version_id: params.version.id,
      })
      .eq('id', existingId)

    if (error) throw error
    return existingId
  }

  const { data, error } = await supabase
    .from('story_extraction_qa_artifacts')
    .insert({
      story_id: params.storyId,
      chunk_index: params.chunkIndex,
      stage: 'chunk_refine_claims',
      input_snapshot: params.parentClaimsJson,
      output_snapshot: params.version.claims_json,
      report,
      run_id: params.runId ?? null,
      input_claim_version_id: params.parentVersionId,
      output_claim_version_id: params.version.id,
    })
    .select('id')
    .single()

  if (error) throw error
  if (!data?.id) throw new Error('Failed to create refinement artifact')

  return String(data.id)
}

export type RelinkOrphanedClaimVersionResult = {
  version_id: string
  review_artifact_id: string | null
  refinement_artifact_id: string
  promoted_active: boolean
  refinement_round: number
  chunk_status: string
}

async function loadClaimVersion(
  supabase: SupabaseClient,
  versionId: string
): Promise<ClaimVersionWithReviewLink & { story_id: string; chunk_index: number }> {
  const { data, error } = await supabase
    .from('chunk_claim_versions')
    .select(
      'id, story_id, chunk_index, version_number, source, parent_version_id, created_from_review_artifact_id, review_outcome, created_at, claims_json, run_id'
    )
    .eq('id', versionId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Claim version not found')

  return {
    id: String(data.id),
    story_id: String(data.story_id),
    chunk_index: Number(data.chunk_index),
    version_number: Number(data.version_number),
    source: data.source === 'refiner' ? 'refiner' : 'extractor',
    parent_version_id: str(data.parent_version_id),
    created_from_review_artifact_id: str(data.created_from_review_artifact_id),
    review_outcome: str(data.review_outcome),
    created_at: String(data.created_at),
    claims_json: data.claims_json,
    run_id: str(data.run_id),
  }
}

export async function relinkOrphanedClaimVersion(
  supabase: SupabaseClient,
  params: {
    storyId: string
    chunkIndex: number
    versionId: string
    reviewArtifactId?: string | null
    refinementArtifactId?: string | null
  }
): Promise<RelinkOrphanedClaimVersionResult> {
  const orphans = await fetchOrphanedClaimVersions(supabase, params.storyId, params.chunkIndex)
  const orphan = orphans.find((row) => row.version_id === params.versionId)
  if (!orphan) {
    throw new Error('Version is not orphaned or does not exist')
  }

  const version = await loadClaimVersion(supabase, params.versionId)
  if (version.story_id !== params.storyId || version.chunk_index !== params.chunkIndex) {
    throw new Error('Version does not belong to this chunk')
  }
  if (version.source !== 'refiner') {
    throw new Error('Only refiner-created versions can be relinked')
  }
  if (!version.parent_version_id) {
    throw new Error('Orphaned refiner version is missing parent_version_id')
  }

  const parentVersion = await loadClaimVersion(supabase, version.parent_version_id)
  const chunk = await loadChunkQaState(supabase, params.storyId, params.chunkIndex)

  const { data: artifacts, error: artifactsError } = await supabase
    .from('story_extraction_qa_artifacts')
    .select(
      'id, stage, report, reverted_at, claim_version_id, input_claim_version_id, output_claim_version_id'
    )
    .eq('story_id', params.storyId)
    .eq('chunk_index', params.chunkIndex)
    .is('reverted_at', null)

  if (artifactsError) throw artifactsError

  const artifactRows: QaArtifact[] = (artifacts ?? []).map((row) => ({
    id: String(row.id),
    stage: String(row.stage),
    chunk_index: params.chunkIndex,
    input_snapshot: null,
    output_snapshot: null,
    report: row.report,
    run_id: null,
    created_at: '',
    reverted_at: null,
    claim_version_id: str(row.claim_version_id),
    input_claim_version_id: str(row.input_claim_version_id),
    output_claim_version_id: str(row.output_claim_version_id),
  }))

  const reviewArtifactId = await resolveReviewArtifactId(supabase, {
    storyId: params.storyId,
    chunkIndex: params.chunkIndex,
    parentVersionId: version.parent_version_id,
    requestedId: params.reviewArtifactId ?? orphan.suggested_review_artifact_id,
    artifactRows,
    reviewReport: chunk.extraction_qa_review_report,
  })

  const refinementRound = Math.max(
    chunk.extraction_qa_refinement_count,
    version.version_number > 0 ? version.version_number : 1
  )

  const refinementArtifactId = await ensureRefinementArtifact(supabase, {
    storyId: params.storyId,
    chunkIndex: params.chunkIndex,
    version,
    parentVersionId: version.parent_version_id,
    parentClaimsJson: parentVersion.claims_json,
    refinementRound,
    requestedId: params.refinementArtifactId ?? orphan.refinement_artifact_id,
    artifactRows,
    runId: version.run_id ?? null,
  })

  const versionUpdates: Record<string, string> = {}
  if (reviewArtifactId) {
    versionUpdates.created_from_review_artifact_id = reviewArtifactId
  }

  if (Object.keys(versionUpdates).length > 0) {
    const { error: versionError } = await supabase
      .from('chunk_claim_versions')
      .update(versionUpdates)
      .eq('id', version.id)

    if (versionError) throw versionError
  }

  const linkedArtifacts: QaArtifact[] = [
    ...artifactRows,
    {
      id: refinementArtifactId,
      stage: 'chunk_refine_claims',
      chunk_index: params.chunkIndex,
      input_snapshot: null,
      output_snapshot: null,
      report: {
        output_claim_version_id: version.id,
        input_claim_version_id: version.parent_version_id,
      },
      run_id: null,
      created_at: '',
      reverted_at: null,
      input_claim_version_id: version.parent_version_id,
      output_claim_version_id: version.id,
    },
  ]

  if (!refinementArtifactForOutput(linkedArtifacts, version.id)) {
    throw new Error('Refinement artifact link could not be verified')
  }

  if (
    orphan.orphan_reasons.includes('missing_created_from_review_artifact_id') &&
    !reviewArtifactId
  ) {
    throw new Error('No matching review artifact found for parent version; cannot relink safely')
  }

  const nextStatus =
    chunk.extraction_qa_status === 'needs_human_review' ? 'needs_human_review' : 'pending'

  const priorChunk = {
    active_claim_version_id: chunk.active_claim_version_id,
    extraction_json: chunk.extraction_json,
    extraction_qa_status: chunk.extraction_qa_status,
    extraction_qa_refinement_count: chunk.extraction_qa_refinement_count,
  }

  const { error: chunkError } = await supabase
    .from('story_chunks')
    .update({
      active_claim_version_id: version.id,
      extraction_json: version.claims_json,
      extraction_qa_status: nextStatus,
      extraction_qa_refinement_count: refinementRound,
      extraction_qa_validated_at: null,
    })
    .eq('story_id', params.storyId)
    .eq('chunk_index', params.chunkIndex)

  if (chunkError) throw chunkError

  const stillOrphaned = await fetchOrphanedClaimVersions(supabase, params.storyId, params.chunkIndex)
  if (stillOrphaned.some((row) => row.version_id === version.id)) {
    await supabase
      .from('story_chunks')
      .update({
        active_claim_version_id: priorChunk.active_claim_version_id,
        extraction_json: priorChunk.extraction_json,
        extraction_qa_status: priorChunk.extraction_qa_status,
        extraction_qa_refinement_count: priorChunk.extraction_qa_refinement_count,
        extraction_qa_validated_at: null,
      })
      .eq('story_id', params.storyId)
      .eq('chunk_index', params.chunkIndex)
    throw new Error('Relink completed but version is still orphaned')
  }

  return {
    version_id: version.id,
    review_artifact_id: reviewArtifactId,
    refinement_artifact_id: refinementArtifactId,
    promoted_active: true,
    refinement_round: refinementRound,
    chunk_status: nextStatus,
  }
}

export async function deleteOrphanedClaimVersion(
  supabase: SupabaseClient,
  params: {
    storyId: string
    chunkIndex: number
    versionId: string
  }
): Promise<{ deleted_version_id: string }> {
  const orphans = await fetchOrphanedClaimVersions(supabase, params.storyId, params.chunkIndex)
  const orphan = orphans.find((row) => row.version_id === params.versionId)
  if (!orphan) {
    throw new Error('Version is not orphaned or does not exist')
  }
  if (orphan.is_active) {
    throw new Error('Cannot delete the active claim version; activate a linked version first')
  }

  const { data: chunk, error: chunkError } = await supabase
    .from('story_chunks')
    .select('active_claim_version_id')
    .eq('story_id', params.storyId)
    .eq('chunk_index', params.chunkIndex)
    .maybeSingle()

  if (chunkError) throw chunkError
  if (str(chunk?.active_claim_version_id) === params.versionId) {
    throw new Error('Cannot delete the active claim version')
  }

  const nullFkUpdates = [
    supabase
      .from('story_extraction_qa_artifacts')
      .update({ claim_version_id: null })
      .eq('claim_version_id', params.versionId),
    supabase
      .from('story_extraction_qa_artifacts')
      .update({ input_claim_version_id: null })
      .eq('input_claim_version_id', params.versionId),
    supabase
      .from('story_extraction_qa_artifacts')
      .update({ output_claim_version_id: null })
      .eq('output_claim_version_id', params.versionId),
  ]

  for (const update of nullFkUpdates) {
    const { error } = await update
    if (error) throw error
  }

  const { error: deleteError } = await supabase
    .from('chunk_claim_versions')
    .delete()
    .eq('id', params.versionId)
    .eq('story_id', params.storyId)
    .eq('chunk_index', params.chunkIndex)

  if (deleteError) throw deleteError

  return { deleted_version_id: params.versionId }
}

export async function cleanupOrphanedClaimVersions(
  supabase: SupabaseClient,
  params: {
    storyId: string
    chunkIndex: number
    action: 'relink_all' | 'delete_all'
  }
): Promise<{
  relinked: RelinkOrphanedClaimVersionResult[]
  deleted: string[]
  skipped: Array<{ version_id: string; reason: string }>
}> {
  const orphans = await fetchOrphanedClaimVersions(supabase, params.storyId, params.chunkIndex)
  const relinked: RelinkOrphanedClaimVersionResult[] = []
  const deleted: string[] = []
  const skipped: Array<{ version_id: string; reason: string }> = []

  if (params.action === 'relink_all') {
    for (const orphan of orphans) {
      try {
        relinked.push(
          await relinkOrphanedClaimVersion(supabase, {
            storyId: params.storyId,
            chunkIndex: params.chunkIndex,
            versionId: orphan.version_id,
            reviewArtifactId: orphan.suggested_review_artifact_id,
            refinementArtifactId: orphan.refinement_artifact_id,
          })
        )
      } catch (error) {
        skipped.push({
          version_id: orphan.version_id,
          reason: error instanceof Error ? error.message : 'Relink failed',
        })
      }
    }
  }

  if (params.action === 'delete_all') {
    const { data, error } = await supabase.rpc('cleanup_orphaned_claim_versions', {
      p_story_id: params.storyId,
      p_chunk_index: params.chunkIndex,
    })
    if (error) throw error
    const deletedCount =
      data && typeof data === 'object' && 'deleted' in data && typeof data.deleted === 'number'
        ? data.deleted
        : 0
    if (deletedCount > 0) {
      deleted.push(`rpc:cleanup_orphaned_claim_versions (${deletedCount} rows)`)
    }
  }

  return { relinked, deleted, skipped }
}

export function orphanedVersionsForChunkExport(params: {
  allVersions: ClaimVersionWithReviewLink[]
  visibleVersionIds: Set<string>
  artifacts: QaArtifact[]
  activeVersionId: string | null
  reviews: ChunkReviewExport[]
}): OrphanedClaimVersionRow[] {
  const orphans = findOrphanedClaimVersions({
    versions: params.allVersions,
    artifacts: params.artifacts,
    activeVersionId: params.activeVersionId,
    reviews: params.reviews,
  })

  return orphans.filter(
    (orphan) =>
      !params.visibleVersionIds.has(orphan.version_id) ||
      orphan.orphan_reasons.includes('missing_created_from_review_artifact_id')
  )
}
