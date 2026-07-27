import type { AgentDisplayNameMap } from '@/lib/admin/agent-display-names'
import type { PipelineChecklist } from '@/lib/admin/story-pipeline-checklist'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { buildVisionGraph } from '@/lib/admin/workflow-canvas/build-vision-graph'
import {
  CHUNK_CLAIMS_VISION_EDGES,
  CHUNK_CLAIMS_VISION_NODES,
} from '@/lib/admin/workflow-canvas/vision-flow-layout'

export function buildChunkVisionGraph(params: {
  checklist: PipelineChecklist
  isStepRunning: (stepId: PipelineStepId) => boolean
  payload: StoryExtractionReviewPayload
  displayNameOverrides?: AgentDisplayNameMap
}) {
  return buildVisionGraph({
    ...params,
    nodeSpecs: CHUNK_CLAIMS_VISION_NODES,
    edgeSpecs: CHUNK_CLAIMS_VISION_EDGES,
    canvasScope: 'chunk',
  })
}
