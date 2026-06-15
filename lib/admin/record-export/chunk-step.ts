import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { PIPELINE_STEPS } from '@/lib/admin/generated/pipeline-catalog'
import {
  assembleChunkLaneLifecycle,
  CHUNK_EXPORT_STEP_KEYS,
  checkChunkExportInvariants,
  deriveChunkStepNextAction,
  deriveChunkStepOutcome,
  getChunkStepCompletedAt,
  getChunkStepExportOutput,
  resolveChunkAtomType,
} from '@/lib/admin/chunk-step-export'
import { derivePipelineChecklist } from '@/lib/admin/pipeline-status'
import { isChunkParallelStep } from '@/lib/admin/pipeline-status/extraction-groups'
import { QA_LANE_ARTIFACT_STAGES } from '@/lib/admin/pipeline-status/qa-lane-stages'
import { bullet, formatExportDate } from '@/lib/admin/record-export/shared'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export type ChunkStepExportOptions = {
  chunkIndex: number
  atomType?: 'claims' | 'positions'
}

function resolveLaneForExport(
  stepId: PipelineStepId,
  atomType: 'claims' | 'positions' | undefined
): 'claims' | 'positions' | null {
  const fromStep = resolveChunkAtomType(stepId)
  if (fromStep) return fromStep
  return atomType ?? null
}

export function buildChunkStepExportPayload(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  options: ChunkStepExportOptions
) {
  const { chunkIndex } = options
  const chunk = payload.chunks.find((row) => row.chunk_index === chunkIndex)
  const lane = resolveLaneForExport(stepId, options.atomType)
  const catalog = PIPELINE_STEPS.find((step) => step.id === stepId)
  const checklistStep = derivePipelineChecklist(payload, {
    scope: 'chunk',
    chunkIndex,
  }).steps.find((step) => step.id === stepId)

  const story = {
    story_id: payload.story.story_id,
    story_friendly_id: payload.story.friendly_id,
    title: payload.story.title,
    url: payload.story.url,
  }

  if (!chunk || !lane) {
    return {
      export_scope: 'chunk_step' as const,
      exported_at: new Date().toISOString(),
      story,
      chunk: {
        chunk_id: null,
        chunk_index: chunkIndex,
        total_chunks: payload.chunks.length,
        atom_type: lane,
      },
      step: {
        id: stepId,
        export_step_key: CHUNK_EXPORT_STEP_KEYS[stepId] ?? null,
        label: catalog?.label ?? stepId,
        deploy_name: catalog?.deployName ?? stepId,
        scope: 'chunk' as const,
        stage_id: catalog?.stageId ?? null,
        status: checklistStep?.status ?? null,
        outcome: null,
        next_action: null,
        complete: false,
        completed_at: null,
      },
      output: null,
      error: chunk ? 'unknown_atom_type' : 'chunk_not_found',
    }
  }

  const lifecycle = assembleChunkLaneLifecycle({
    lane,
    chunk,
    chunkIndex,
    stepId,
    payload,
  })

  const stepComplete =
    checklistStep?.status === 'complete' || checklistStep?.status === 'optional'
  const outcome = deriveChunkStepOutcome(lane, chunk)
  const nextAction = deriveChunkStepNextAction(lane, chunk, stepId)
  let completedAt = getChunkStepCompletedAt(
    stepId,
    payload,
    chunkIndex,
    chunk,
    lane,
    lifecycle.reviews
  )
  if (stepComplete && !completedAt) {
    completedAt = lifecycle.reviews.at(-1)?.created_at ?? new Date().toISOString()
  }

  const output = getChunkStepExportOutput(stepId, chunk, lane, lifecycle.atomStatus)
  const exportStepKey = CHUNK_EXPORT_STEP_KEYS[stepId] ?? null

  const invariantViolations = checkChunkExportInvariants({
    stepComplete,
    stepCompletedAt: completedAt,
    stepNextAction: nextAction,
    atomStatus: lifecycle.atomStatus,
    reviews: lifecycle.reviews,
    refinements: lifecycle.refinements,
    claimVersions: lifecycle.claimVersions,
    lineage: lifecycle.lineage,
    phase: lifecycle.phase,
    hiddenRefinerVersionCount: lifecycle.hiddenRefinerVersionCount,
  })

  const base = {
    export_scope: 'chunk_step' as const,
    exported_at: new Date().toISOString(),
    story,
    chunk: {
      chunk_id: chunk.friendly_id,
      chunk_index: chunk.chunk_index,
      total_chunks: payload.chunks.length,
      atom_type: lane,
    },
    view_state: lifecycle.viewState,
    step: {
      id: stepId,
      export_step_key: exportStepKey,
      label: catalog?.label ?? stepId,
      deploy_name: catalog?.deployName ?? stepId,
      scope: 'chunk' as const,
      stage_id: catalog?.stageId ?? null,
      status: checklistStep?.status ?? null,
      outcome,
      next_action: nextAction,
      complete: stepComplete,
      completed_at: completedAt,
    },
    output,
    atom_status: lifecycle.atomStatus,
    reviews: lifecycle.reviews,
    refinements: lifecycle.refinements,
    lineage: lifecycle.lineage,
    invariant_violations: invariantViolations,
  }

  if (lane === 'claims') {
    return {
      ...base,
      claim_versions: lifecycle.claimVersions,
      orphaned_versions: lifecycle.orphanedVersions,
    }
  }

  return base
}

export function isChunkStepExportable(
  stepId: PipelineStepId,
  chunkIndex?: number
): chunkIndex is number {
  return chunkIndex != null && isChunkParallelStep(stepId)
}

export function buildChunkStepExportJson(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  options: ChunkStepExportOptions
): string {
  return JSON.stringify(buildChunkStepExportPayload(stepId, payload, options), null, 2)
}

export function buildChunkStepExportMarkdown(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  options: ChunkStepExportOptions
): string {
  const data = buildChunkStepExportPayload(stepId, payload, options)
  const lines: string[] = []

  lines.push('# Chunk step export', '')
  lines.push(bullet('Export scope', data.export_scope))
  lines.push(bullet('Exported at', formatExportDate(data.exported_at)))
  lines.push('')

  lines.push('## Story', '')
  lines.push(bullet('Story ID', data.story.story_friendly_id ?? data.story.story_id))
  lines.push(bullet('Title', data.story.title))
  lines.push('')

  lines.push('## Chunk', '')
  lines.push(bullet('Chunk ID', data.chunk.chunk_id))
  lines.push(bullet('Chunk index', data.chunk.chunk_index))
  lines.push(bullet('Total chunks', data.chunk.total_chunks))
  lines.push(bullet('Atom type', data.chunk.atom_type))
  lines.push('')

  if ('view_state' in data && data.view_state) {
    lines.push('## View state', '')
    lines.push(bullet('Selected step', data.view_state.selected_step))
    lines.push(bullet('Selected version', data.view_state.selected_version_id))
    lines.push(bullet('Selected review', data.view_state.selected_review_id))
    lines.push(bullet('Lifecycle', data.view_state.lifecycle_summary))
    lines.push('')
  }

  lines.push('## Agent step', '')
  lines.push(bullet('Step ID', data.step.id))
  if (data.step.export_step_key) {
    lines.push(bullet('Export step key', data.step.export_step_key))
  }
  lines.push(bullet('Label', data.step.label))
  lines.push(bullet('Deploy name', data.step.deploy_name))
  lines.push(bullet('Pipeline status', data.step.status))
  lines.push(bullet('Outcome', data.step.outcome))
  lines.push(bullet('Next action', data.step.next_action))
  lines.push(bullet('Complete', data.step.complete ? 'yes' : 'no'))
  lines.push(bullet('Completed at', formatExportDate(data.step.completed_at)))
  lines.push('')

  if ('invariant_violations' in data && data.invariant_violations.length > 0) {
    lines.push('## Invariant violations', '')
    data.invariant_violations.forEach((violation) => {
      lines.push(`- ${violation}`)
    })
    lines.push('')
  }

  if ('atom_status' in data && data.atom_status) {
    lines.push('## Atom status', '')
    lines.push('```json')
    lines.push(JSON.stringify(data.atom_status, null, 2))
    lines.push('```')
    lines.push('')
  }

  if (data.output != null) {
    lines.push('## Step output', '')
    lines.push('```json')
    lines.push(JSON.stringify(data.output, null, 2))
    lines.push('```')
    lines.push('')
  }

  if ('lineage' in data && data.lineage.length > 0) {
    lines.push('## Lineage', '')
    lines.push('```json')
    lines.push(JSON.stringify(data.lineage, null, 2))
    lines.push('```')
    lines.push('')
  }

  if ('reviews' in data && data.reviews.length > 0) {
    lines.push('## Reviews', '')
    data.reviews.forEach((review, index) => {
      lines.push(`### Review ${index + 1}`)
      lines.push(bullet('Review ID', review.review_id))
      lines.push(bullet('Round', review.review_round))
      lines.push(bullet('Reviewed version', review.reviewed_version_id))
      lines.push(bullet('Outcome', review.outcome))
      lines.push(bullet('Next action', review.next_action))
      lines.push(bullet('Passes review', review.passes_review === null ? null : review.passes_review ? 'yes' : 'no'))
      lines.push(bullet('Issues', review.issues_count))
      lines.push(bullet('Patches', review.patches_count))
      lines.push(bullet('Created at', formatExportDate(review.created_at)))
      lines.push('')
    })
  }

  if ('refinements' in data && data.refinements.length > 0) {
    lines.push('## Refinements', '')
    lines.push('```json')
    lines.push(JSON.stringify(data.refinements, null, 2))
    lines.push('```')
    lines.push('')
  }

  if ('orphaned_versions' in data && data.orphaned_versions.length > 0) {
    lines.push('## Orphaned claim versions', '')
    lines.push(
      'These refiner versions are stored but not linked into the active lifecycle. Use the chunk admin cleanup panel to delete or relink them.'
    )
    lines.push('```json')
    lines.push(JSON.stringify(data.orphaned_versions, null, 2))
    lines.push('```')
    lines.push('')
  }

  if ('claim_versions' in data && data.claim_versions.length > 0) {
    lines.push('## Claim versions', '')
    lines.push('```json')
    lines.push(JSON.stringify(data.claim_versions, null, 2))
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

export function chunkStepExportBasename(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  chunkIndex: number
): string {
  const chunk = payload.chunks.find((row) => row.chunk_index === chunkIndex)
  const chunkLabel = chunk?.friendly_id ?? `chunk-${chunkIndex}`
  const storyLabel = payload.story.friendly_id ?? payload.story.story_id
  return `chunk-step-${storyLabel}-${chunkLabel}-${stepId}`
}

export function chunkStepExportStages(stepId: PipelineStepId): readonly string[] {
  const lane = resolveChunkAtomType(stepId)
  if (!lane) return []
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  if (stepId === stages.extractStep) {
    return lane === 'claims'
      ? ['chunk_extract_claims', 'chunk_extract']
      : ['chunk_extract_positions']
  }
  if (stepId === stages.validateStep) return stages.review
  if (stepId === stages.refineStep) return stages.refine
  return []
}
