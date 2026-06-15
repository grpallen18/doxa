import type { AgentDisplayNameMap } from '@/lib/admin/agent-display-names'
import type { PipelineChecklist } from '@/lib/admin/story-pipeline-checklist'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { CHUNK_PARALLEL_STEP_IDS } from '@/lib/admin/pipeline-status/extraction-groups'
import { buildVisionGraph } from '@/lib/admin/workflow-canvas/build-vision-graph'
import {
  VISION_FLOW_EDGES,
  VISION_FLOW_NODES,
} from '@/lib/admin/workflow-canvas/vision-flow-layout'

const CHUNK_PARALLEL_NODE_IDS = new Set(
  VISION_FLOW_NODES.filter(
    (node) =>
      node.catalogStepId != null &&
      (CHUNK_PARALLEL_STEP_IDS as readonly string[]).includes(node.catalogStepId)
  ).map((node) => node.id)
)

const CHUNK_NODE_SPECS = VISION_FLOW_NODES.filter((node) => CHUNK_PARALLEL_NODE_IDS.has(node.id))

export function buildChunkVisionGraph(params: {
  checklist: PipelineChecklist
  isStepRunning: (stepId: PipelineStepId) => boolean
  payload: StoryExtractionReviewPayload
  displayNameOverrides?: AgentDisplayNameMap
}) {
  return buildVisionGraph({
    ...params,
    nodeSpecs: CHUNK_NODE_SPECS,
    edgeSpecs: VISION_FLOW_EDGES,
    canvasScope: 'chunk',
  })
}
