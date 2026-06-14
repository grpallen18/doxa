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
  return spec.maturity === 'partial' || spec.maturity === 'placeholder'
}

export function buildVisionGraph({
  checklist,
  isStepRunning,
  payload,
  displayNameOverrides,
}: {
  checklist: PipelineChecklist
  isStepRunning: (stepId: PipelineStepId) => boolean
  payload: StoryExtractionReviewPayload
  displayNameOverrides?: AgentDisplayNameMap
}): { nodes: Node[]; edges: Edge[] } {
  const stepById = new Map<PipelineStepId, PipelineStepState>()
  for (const step of checklist.steps) stepById.set(step.id, step)

  const nodes: Node[] = VISION_FLOW_NODES.map((spec) => {
    const catalogStepId = spec.catalogStepId
    const stepState = catalogStepId ? stepById.get(catalogStepId) : undefined
    const running = catalogStepId ? isStepRunning(catalogStepId) : false
    const label = catalogStepId
      ? catalogLabel(catalogStepId, displayNameOverrides)
      : spec.visionLabel

    const baseData = {
      visionLabel: spec.visionLabel,
      label,
      desc: spec.roadmapNote ?? stepState?.progress ?? '',
      maturity: spec.maturity,
      catalogStepId: catalogStepId ?? null,
      handlerPath: spec.handlerPath ?? null,
      roadmapNote: spec.roadmapNote ?? null,
      runnable: stepState?.runnable ?? false,
      manifestStatus: stepState?.manifestStatus ?? null,
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
          inDevelopment: isInDevelopment(spec),
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

  const edges: Edge[] = VISION_FLOW_EDGES.map((spec) => {
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
