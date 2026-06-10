import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

export type VisionMaturity = 'live' | 'partial' | 'placeholder'

export type VisionNodeType =
  | 'agent'
  | 'decision'
  | 'merge'
  | 'fanout'
  | 'placeholder'
  | 'terminal'

export type VisionDecisionMode = 'binary' | 'qualify' | 'approval'

export type VisionLane = 'main' | 'claims' | 'positions' | 'events' | 'evidence' | 'downstream'

export type VisionNodeSpec = {
  id: string
  visionLabel: string
  nodeType: VisionNodeType
  maturity: VisionMaturity
  catalogStepId?: PipelineStepId
  handlerPath?: string
  roadmapNote?: string
  lane?: VisionLane
  column: number
  row: number
  /** Decision exit layout: qualify = Keep/Drop/Pending; approval = Keep/Drop. */
  decisionMode?: VisionDecisionMode
}

export type VisionEdgeSpec = {
  id: string
  source: string
  target: string
  /** Legacy semantic metadata (routing is fully dynamic). */
  sourceHandle?: string
  /** Legacy semantic metadata (routing is fully dynamic). */
  targetHandle?: string
  kind: 'pass' | 'fail' | 'return' | 'neutral'
}

export type AgentDisplayStatus =
  | 'Ready'
  | 'Running'
  | 'Approved'
  | 'Failed'
  | 'Needs Review'
  | 'Refining'
  | 'Human Review'
