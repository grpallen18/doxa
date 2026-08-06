import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

const FLOW_NODE_LABELS: Partial<Record<PipelineStepId, string>> = {
  'review-pending-stories': 'Pending approval',
  'scrape-story-content': 'Scrape story',
  'clean-scraped-content': 'Clean scraped content',
  'enqueue-graph-job': 'Enqueue graph job',
  'trigger-graph-worker': 'Build knowledge graph',
  'debate-pipeline': 'Debate assembly',
}

export function getFlowNodeLabel(stepId: PipelineStepId, fallback: string): string {
  return FLOW_NODE_LABELS[stepId] ?? fallback
}
