import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { PIPELINE_STEPS } from '@/lib/admin/generated/pipeline-catalog'
import { derivePipelineChecklist } from '@/lib/admin/pipeline-status'
import {
  getStoryStepCompletedAt,
  getStoryStepMetadataSnapshot,
  getStoryStepQaArtifacts,
} from '@/lib/admin/story-step-metadata'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { bullet, formatExportDate } from '@/lib/admin/record-export/shared'

export function buildStoryStepExportPayload(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
) {
  const catalog = PIPELINE_STEPS.find((step) => step.id === stepId)
  const checklistStep = derivePipelineChecklist(payload).steps.find((step) => step.id === stepId)

  return {
    export_scope: 'story_step' as const,
    exported_at: new Date().toISOString(),
    step: {
      id: stepId,
      label: catalog?.label ?? stepId,
      deploy_name: catalog?.deployName ?? stepId,
      stage_id: catalog?.stageId ?? null,
      manifest_status: catalog?.manifestStatus ?? null,
      status: checklistStep?.status ?? null,
      progress: checklistStep?.progress ?? null,
      complete: checklistStep?.status === 'complete' || checklistStep?.status === 'optional',
      completed_at: getStoryStepCompletedAt(stepId, payload),
    },
    story: {
      story_id: payload.story.story_id,
      story_friendly_id: payload.story.friendly_id,
      title: payload.story.title,
      url: payload.story.url,
    },
    metadata: getStoryStepMetadataSnapshot(stepId, payload),
    qa_artifacts: getStoryStepQaArtifacts(stepId, payload),
  }
}

export function buildStoryStepExportJson(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string {
  return JSON.stringify(buildStoryStepExportPayload(stepId, payload), null, 2)
}

export function buildStoryStepExportMarkdown(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string {
  const data = buildStoryStepExportPayload(stepId, payload)
  const lines: string[] = []

  lines.push('# Story step export', '')
  lines.push(bullet('Export scope', data.export_scope))
  lines.push(bullet('Exported at', formatExportDate(data.exported_at)))
  lines.push('')

  lines.push('## Agent step', '')
  lines.push(bullet('Step ID', data.step.id))
  lines.push(bullet('Label', data.step.label))
  lines.push(bullet('Deploy name', data.step.deploy_name))
  lines.push(bullet('Stage', data.step.stage_id))
  lines.push(bullet('Manifest status', data.step.manifest_status))
  lines.push(bullet('Pipeline status', data.step.status))
  lines.push(bullet('Complete', data.step.complete ? 'yes' : 'no'))
  lines.push(bullet('Completed at', formatExportDate(data.step.completed_at)))
  if (data.step.progress) {
    lines.push(bullet('Progress', data.step.progress))
  }
  lines.push('')

  lines.push('## Story', '')
  lines.push(bullet('Story ID', data.story.story_friendly_id ?? data.story.story_id))
  lines.push(bullet('Title', data.story.title))
  lines.push(bullet('URL', data.story.url))
  lines.push('')

  lines.push('## Step snapshot', '')
  lines.push('```json')
  lines.push(JSON.stringify(data.metadata.output_snapshot, null, 2))
  lines.push('```')
  lines.push('')

  if (data.qa_artifacts.length > 0) {
    lines.push('## QA artifacts', '')
    data.qa_artifacts.forEach((artifact, index) => {
      lines.push(`### Artifact ${index + 1}`)
      lines.push(bullet('Stage', artifact.stage))
      lines.push(bullet('Chunk index', artifact.chunk_index))
      lines.push(bullet('Created at', formatExportDate(artifact.created_at)))
      lines.push(bullet('Run ID', artifact.run_id))
      lines.push('')
      lines.push('```json')
      lines.push(JSON.stringify(artifact.report ?? artifact.output_snapshot ?? artifact, null, 2))
      lines.push('```')
      lines.push('')
    })
  }

  return lines.join('\n')
}
