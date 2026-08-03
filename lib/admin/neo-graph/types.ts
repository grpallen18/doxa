import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'

/** Phase 0 ontology labels used by the Neo explorer. */
export type NeoNodeKind =
  | 'document'
  | 'publication'
  | 'agent'
  | 'utterance'
  | 'segment'
  | 'entity'

export type NeoEdgeType =
  | 'PUBLISHED_BY'
  | 'CONTAINS'
  | 'GROUNDED_IN'
  | 'ASSERTED_BY'
  | 'REFERRED_AS'
  | 'MENTIONS'

/** Generic projection the Sigma layer consumes (mode-agnostic). */
export type DoxaGraphNode = {
  id: string
  kind: NeoNodeKind
  label: string
  aliases: string[]
  degreeHint: number
  properties: Record<string, string | number | boolean | null>
  /** Present for utterances — drives passage highlight. */
  charStart?: number
  charEnd?: number
}

export type DoxaGraphEdge = {
  id: string
  source: string
  target: string
  type: NeoEdgeType
  label: string
  properties: Record<string, string | number | boolean | null>
}

export type DoxaGraphProjection = {
  projectionId: 'phase0-document'
  storyId: string
  title: string | null
  nodes: DoxaGraphNode[]
  edges: DoxaGraphEdge[]
}

export type NeoGraphFilters = {
  kinds: Record<NeoNodeKind, boolean>
  edgeTypes: Record<NeoEdgeType, boolean>
}

export const ALL_NODE_KINDS: NeoNodeKind[] = [
  'document',
  'publication',
  'agent',
  'utterance',
  'segment',
  'entity',
]

export const ALL_EDGE_TYPES: NeoEdgeType[] = [
  'PUBLISHED_BY',
  'CONTAINS',
  'GROUNDED_IN',
  'ASSERTED_BY',
  'REFERRED_AS',
  'MENTIONS',
]

export const DEFAULT_NEO_FILTERS: NeoGraphFilters = {
  kinds: {
    document: true,
    publication: true,
    agent: true,
    utterance: true,
    /** Segments add density; off by default for discourse-first view. */
    segment: false,
    entity: true,
  },
  edgeTypes: {
    PUBLISHED_BY: true,
    CONTAINS: true,
    GROUNDED_IN: true,
    ASSERTED_BY: true,
    REFERRED_AS: true,
    MENTIONS: false,
  },
}

export type NeoDocumentGraphSource = NeoDocumentGraph
