import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'

/** Ontology labels used by the Neo explorer (document + hub modes). */
export type NeoNodeKind =
  | 'document'
  | 'publication'
  | 'agent'
  | 'utterance'
  | 'segment'
  | 'entity'
  | 'proposition'
  | 'argument'
  | 'viewpoint'
  | 'controversy'
  | 'dispute'

export type NeoEdgeType =
  | 'PUBLISHED_BY'
  | 'CONTAINS'
  | 'GROUNDED_IN'
  | 'ASSERTED_BY'
  | 'REFERRED_AS'
  | 'MENTIONS'
  | 'EXPRESSES'
  | 'HAS_ROLE'
  | 'ADVANCES'
  | 'INCLUDES'
  | 'RELATES_TO'
  | 'CONCERNS'
  | 'VARIANT_OF'
  | 'ABOUT'

export type NeoProjectionId =
  | 'phase0-document'
  | 'hub-controversy'
  | 'hub-proposition'
  | 'hub-entity'
  | 'union-documents'

export type NeoHubRootKind = 'controversy' | 'proposition' | 'entity'

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
  projectionId: NeoProjectionId
  /** Document mode story id; also set for hubs when a single primary doc is selected. */
  storyId: string | null
  rootId: string
  rootKind: 'document' | 'union' | NeoHubRootKind
  title: string | null
  nodes: DoxaGraphNode[]
  edges: DoxaGraphEdge[]
  /** Evidence / related documents for hub chrome. */
  documents?: Array<{ uid: string; title: string | null }>
  /** True when Cypher-side caps dropped rows before Graphology. */
  queryTruncated?: boolean
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
  'proposition',
  'argument',
  'viewpoint',
  'controversy',
  'dispute',
]

export const ALL_EDGE_TYPES: NeoEdgeType[] = [
  'PUBLISHED_BY',
  'CONTAINS',
  'GROUNDED_IN',
  'ASSERTED_BY',
  'REFERRED_AS',
  'MENTIONS',
  'EXPRESSES',
  'HAS_ROLE',
  'ADVANCES',
  'INCLUDES',
  'RELATES_TO',
  'CONCERNS',
  'VARIANT_OF',
  'ABOUT',
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
    proposition: false,
    argument: false,
    viewpoint: false,
    controversy: false,
    dispute: false,
  },
  edgeTypes: {
    PUBLISHED_BY: true,
    CONTAINS: true,
    GROUNDED_IN: true,
    ASSERTED_BY: true,
    REFERRED_AS: true,
    MENTIONS: false,
    EXPRESSES: false,
    HAS_ROLE: false,
    ADVANCES: false,
    INCLUDES: false,
    RELATES_TO: false,
    CONCERNS: false,
    VARIANT_OF: false,
    ABOUT: false,
  },
}

/** Default filters for Controversy / Proposition / Entity hub explorers. */
export const DEFAULT_HUB_FILTERS: NeoGraphFilters = {
  kinds: {
    document: true,
    publication: false,
    agent: true,
    utterance: true,
    segment: false,
    entity: true,
    proposition: true,
    argument: true,
    viewpoint: true,
    controversy: true,
    dispute: true,
  },
  edgeTypes: {
    PUBLISHED_BY: false,
    CONTAINS: false,
    GROUNDED_IN: true,
    ASSERTED_BY: true,
    REFERRED_AS: true,
    MENTIONS: true,
    EXPRESSES: true,
    HAS_ROLE: true,
    ADVANCES: true,
    INCLUDES: true,
    RELATES_TO: true,
    CONCERNS: true,
    VARIANT_OF: false,
    ABOUT: false,
  },
}

export type NeoDocumentGraphSource = NeoDocumentGraph
