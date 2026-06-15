import { MarkerType, type Edge, type Node } from '@xyflow/react'
import { PIPELINE_STEPS } from '@/lib/admin/generated/pipeline-catalog'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { AgentDisplayNameMap } from '@/lib/admin/agent-display-names'
import { resolveAgentDisplayName } from '@/lib/admin/agent-display-names'
import type { PipelineChecklist, PipelineStepState } from '@/lib/admin/story-pipeline-checklist'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  DEFAULT_EDGE_COLOR,
  defaultLabelForEdge,
  EDGE_COLOR_STYLES,
} from '@/lib/admin/workflow-canvas/edge-meta'
import { mapAgentNodeStatus } from '@/lib/admin/workflow-canvas/step-status-display'
import type { VisionNodeSpec } from '@/lib/admin/workflow-canvas/types'
import { VISION_FLOW_EDGES, VISION_FLOW_NODES } from '@/lib/admin/workflow-canvas/vision-flow-layout'
import { isChunkParallelStep } from '@/lib/admin/pipeline-status/extraction-groups'

const COL_WIDTH = 300
const ROW_HEIGHT = 230
const MAIN_ROW = 1

const LANE_ROW_OFFSET: Record<string, number> = {
  main: MAIN_ROW,
  claims: 0,
  positions: 1,
  events: 2,
  evidence: 3,
  downstream: 0,
}

function positionForNode(spec: VisionNodeSpec): { x: number; y: number } {
  const lane = spec.lane ?? 'main'
  const laneBase = LANE_ROW_OFFSET[lane] ?? 0
  const y =
    lane === 'main' || lane === 'downstream'
      ? (laneBase + spec.row) * 120 + 80
      : laneBase * ROW_HEIGHT + spec.row * 160 + 40
  return { x: spec.column * COL_WIDTH + 40, y }
}

function catalogLabel(stepId: PipelineStepId, displayNameOverrides?: AgentDisplayNameMap): string {
  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  const fallback = def?.label ?? stepId
  return resolveAgentDisplayName(stepId, fallback, displayNameOverrides)
}

function usesAgentPresentation(spec: VisionNodeSpec): boolean {
  return spec.nodeType === 'agent' || spec.nodeType === 'decision' || spec.nodeType === 'merge'
}

function resolveReactFlowType(spec: VisionNodeSpec): string {
  if (usesAgentPresentation(spec)) return 'agent'
  if (spec.nodeType === 'terminal') return 'terminal'
  if (spec.nodeType === 'fanout') return 'fanout'
  return 'placeholder'
}

function resolveAgentIconVariant(
  spec: VisionNodeSpec
): 'bot' | 'human' | 'cloud' {
  if (spec.iconVariant) return spec.iconVariant
  if (spec.catalogStepId === 'review-pending-stories') return 'human'
  return 'bot'
}

function isInDevelopment(spec: VisionNodeSpec): boolean {
  if (spec.maturity === 'partial' || spec.maturity === 'placeholder') return true
  if (spec.catalogStepId && !PIPELINE_STEPS.some((s) => s.id === spec.catalogStepId)) return true
  return false
}

export function buildVisionGraph({
  checklist,
  isStepRunning,
  payload,
  displayNameOverrides,
  nodeSpecs = VISION_FLOW_NODES,
  edgeSpecs = VISION_FLOW_EDGES,
  canvasScope = 'story',
}: {
  checklist: PipelineChecklist
  isStepRunning: (stepId: PipelineStepId) => boolean
  payload: StoryExtractionReviewPayload
  displayNameOverrides?: AgentDisplayNameMap
  nodeSpecs?: VisionNodeSpec[]
  edgeSpecs?: typeof VISION_FLOW_EDGES
  canvasScope?: 'story' | 'chunk'
}): { nodes: Node[]; edges: Edge[] } {
  const stepById = new Map<PipelineStepId, PipelineStepState>()
  for (const step of checklist.steps) stepById.set(step.id, step)

  const nodeIds = new Set(nodeSpecs.map((spec) => spec.id))

  const nodes: Node[] = nodeSpecs.map((spec) => {
    const rawCatalogStepId = spec.catalogStepId
    const catalogStepId =
      rawCatalogStepId &&
      (PIPELINE_STEPS as readonly { id: string }[]).some((s) => s.id === rawCatalogStepId)
        ? (rawCatalogStepId as PipelineStepId)
        : undefined
    const stepState = catalogStepId ? stepById.get(catalogStepId) : undefined
    const running = catalogStepId ? isStepRunning(catalogStepId) : false
    const label = catalogStepId
      ? catalogLabel(catalogStepId, displayNameOverrides)
      : spec.visionLabel
    const chunkLayerOnly =
      canvasScope === 'story' && catalogStepId != null && isChunkParallelStep(catalogStepId)

    const inDevelopment = isInDevelopment(spec)
    const baseData = {
      visionLabel: spec.visionLabel,
      label,
      desc: spec.roadmapNote ?? stepState?.progress ?? '',
      maturity: spec.maturity,
      catalogStepId: rawCatalogStepId ?? null,
      handlerPath: spec.handlerPath ?? null,
      roadmapNote: spec.roadmapNote ?? null,
      runnable: inDevelopment ? false : chunkLayerOnly ? false : (stepState?.runnable ?? false),
      manifestStatus: stepState?.manifestStatus ?? null,
      chunkLayerOnly,
      inDevelopment,
    }

    if (usesAgentPresentation(spec)) {
      return {
        id: spec.id,
        type: 'agent',
        position: positionForNode(spec),
        data: {
          ...baseData,
          status: mapAgentNodeStatus({
            nodeType: spec.nodeType,
            maturity: spec.maturity,
            decisionMode: spec.decisionMode,
            payload,
            step: stepState,
            running,
            catalogStepId,
          }),
          iconVariant: resolveAgentIconVariant(spec),
          retries: 0,
          inDevelopment,
          developmentNote: spec.roadmapNote ?? undefined,
        },
      }
    }

    if (spec.nodeType === 'fanout') {
      return {
        id: spec.id,
        type: 'fanout',
        position: positionForNode(spec),
        data: { label: spec.visionLabel, maturity: spec.maturity },
      }
    }

    if (spec.nodeType === 'terminal') {
      return {
        id: spec.id,
        type: 'terminal',
        position: positionForNode(spec),
        data: {
          label: spec.visionLabel,
          desc: spec.roadmapNote ?? undefined,
          maturity: spec.maturity,
        },
      }
    }

    return {
      id: spec.id,
      type: resolveReactFlowType(spec),
      position: positionForNode(spec),
      data: {
        ...baseData,
        status: 'Planned',
      },
    }
  })

  const greenStyle = EDGE_COLOR_STYLES.green

  const edges: Edge[] = edgeSpecs
    .filter((spec) => nodeIds.has(spec.source) && nodeIds.has(spec.target))
    .map((spec) => {
    const defaultLabel = defaultLabelForEdge(spec)
    return {
      id: spec.id,
      source: spec.source,
      target: spec.target,
      type: 'floating',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: greenStyle.marker },
      style: { stroke: greenStyle.stroke, strokeWidth: 2 },
      data: {
        defaultLabel,
        defaultColor: DEFAULT_EDGE_COLOR,
      },
    }
  })

  return { nodes, edges }
}
