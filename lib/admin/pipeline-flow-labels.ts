import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { FlowPlaceholderStepId } from '@/lib/admin/pipeline-flow-layout'

const FLOW_NODE_LABELS: Partial<Record<PipelineStepId, string>> = {
  'review-pending-stories': 'Pending approval',
  'scrape-story-content': 'Scrape story',
  'chunk-story-bodies': 'Create chunks',
  'extract-story-claims': 'Extract',
  'validate-chunk-claims': 'Review',
  'refine-chunk-claims': 'Refine',
  'merge-story-claims': 'Merge',
  'extract-story-positions': 'Extract',
  'validate-chunk-positions': 'Review',
  'refine-chunk-positions': 'Refine',
  'merge-story-positions': 'Merge',
  'review-merged-extraction': 'Review',
  'refine-merged-extraction': 'Refine',
  'validate-merged-extraction': 'Link entities',
}

export function getFlowNodeLabel(stepId: PipelineStepId, fallback: string): string {
  return FLOW_NODE_LABELS[stepId] ?? fallback
}

const FLOW_PLACEHOLDER_LABELS: Record<FlowPlaceholderStepId, string> = {
  'review-merged-positions': 'Review',
  'refine-merged-positions': 'Refine',
}

export function getFlowPlaceholderLabel(stepId: FlowPlaceholderStepId): string {
  return FLOW_PLACEHOLDER_LABELS[stepId]
}
