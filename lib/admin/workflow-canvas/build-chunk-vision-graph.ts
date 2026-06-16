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

/** Linear claims lane on chunk canvas — no approve→refine loop or merge edges. */
const CHUNK_CLAIMS_EDGE_IDS = new Set(['e-c-ext-rev', 'e-c-rev-ref', 'e-c-ref-apr'])

const CHUNK_PARALLEL_NODE_IDS = new Set(
  VISION_FLOW_NODES.filter(
    (node) =>
      node.catalogStepId != null &&
      (CHUNK_PARALLEL_STEP_IDS as readonly string[]).includes(node.catalogStepId)
  ).map((node) => node.id)
)

const CHUNK_NODE_SPECS = VISION_FLOW_NODES.filter((node) => CHUNK_PARALLEL_NODE_IDS.has(node.id))
const CHUNK_EDGE_SPECS = VISION_FLOW_EDGES.filter((edge) => CHUNK_CLAIMS_EDGE_IDS.has(edge.id))

export function buildChunkVisionGraph(params: {
  checklist: PipelineChecklist
  isStepRunning: (stepId: PipelineStepId) => boolean
  payload: StoryExtractionReviewPayload
  displayNameOverrides?: AgentDisplayNameMap
}) {
  return buildVisionGraph({
    ...params,
    nodeSpecs: CHUNK_NODE_SPECS,
    edgeSpecs: CHUNK_EDGE_SPECS,
    canvasScope: 'chunk',
  })
}
