import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

const FLOW_NODE_LABELS: Partial<Record<PipelineStepId, string>> = {
  'review-pending-stories': 'Pending approval',
  'scrape-story-content': 'Scrape story',
  'chunk-story-bodies': 'Create chunks',
  'extract-story-claims': 'Extract',
  'validate-chunk-claims': 'Review',
}

export function getFlowNodeLabel(stepId: PipelineStepId, fallback: string): string {
  return FLOW_NODE_LABELS[stepId] ?? fallback
}
