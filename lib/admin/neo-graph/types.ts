import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'

/** Ontology labels used by the Neo explorer. */
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
  | 'assessment'
  | 'evidence_check'
  | 'citation'
  | 'method_run'
  /** LOD-only synthetic overview node (not a Neo4j label). */
  | 'cluster'

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
  | 'CHECKS'
  | 'CITES'
  | 'HELD_BY'
  | 'DERIVED_FROM'
  | 'PRODUCED_BY'

export type NeoProjectionId = 'phase0-document' | 'union-documents' | 'union-ontology'

export type NeoCommunityKind =
  | 'controversy'
  | 'publication'
  | 'unlinked'
  | 'bridge'

export type NeoGraphCommunity = {
  id: string
  label: string
  kind: NeoCommunityKind
  memberCount: number
}

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
  /** Union 2.0 ontology island id (`controversy:…` / `publication:…` / unlinked). */
  communityId?: string
  communityLabel?: string
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
  rootKind: 'document' | 'union'
  title: string | null
  nodes: DoxaGraphNode[]
  edges: DoxaGraphEdge[]
  /** Evidence / related documents for union chrome. */
  documents?: Array<{ uid: string; title: string | null }>
  /** True when Cypher-side caps dropped rows before Graphology. */
  queryTruncated?: boolean
  /** Union 2.0 ontology islands (absent on classic union). */
  communities?: NeoGraphCommunity[]
}

/** Fixed ForceAtlas2 knobs for neo explorer layout. */
export type NeoFa2Settings = {
  gravity: number
  scalingRatio: number
  strongGravityMode?: boolean
  linLogMode?: boolean
  adjustSizes?: boolean
}

export const DEFAULT_NEO_FA2_SETTINGS: NeoFa2Settings = {
  gravity: 0.01,
  scalingRatio: 200,
}

/** One irregular mass — no strong gravity (that inflates a marble shell). */
export const UNION_V2_FA2_SETTINGS: NeoFa2Settings = {
  gravity: 0.055,
  scalingRatio: 14,
  strongGravityMode: false,
  linLogMode: true,
  adjustSizes: false,
}

export type NeoLayoutMode = 'hierarchical' | 'ontology-islands'
export type NeoColorMode = 'kind' | 'community'
export type NeoLodClusterMode = 'spatial' | 'membership'

export type NeoGraphFilters = {
  kinds: Record<NeoNodeKind, boolean>
  edgeTypes: Record<NeoEdgeType, boolean>
}

/** Which node kinds force-render their name labels on the Sigma canvas. */
export type NeoLabelVisibility = Record<NeoNodeKind, boolean>

/** Default: only Publication names are visible; legend toggles the rest. */
export const DEFAULT_NEO_LABEL_VISIBILITY: NeoLabelVisibility = {
  document: false,
  publication: true,
  agent: false,
  utterance: false,
  segment: false,
  entity: false,
  proposition: false,
  argument: false,
  viewpoint: false,
  controversy: false,
  dispute: false,
  assessment: false,
  evidence_check: false,
  citation: false,
  method_run: false,
  cluster: true,
}

export const DEFAULT_UNION_V2_LABEL_VISIBILITY: NeoLabelVisibility = {
  document: false,
  publication: false,
  agent: false,
  utterance: false,
  segment: false,
  entity: false,
  proposition: false,
  argument: false,
  viewpoint: false,
  controversy: false,
  dispute: false,
  assessment: false,
  evidence_check: false,
  citation: false,
  method_run: false,
  cluster: false,
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
  'assessment',
  'evidence_check',
  'citation',
  'method_run',
  'cluster',
]

/** Kinds exposed in the filter panel (cluster is LOD-owned, not user-toggled). */
export const FILTERABLE_NODE_KINDS: NeoNodeKind[] = ALL_NODE_KINDS.filter(
  (kind) => kind !== 'cluster'
)

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
  'CHECKS',
  'CITES',
  'HELD_BY',
  'DERIVED_FROM',
  'PRODUCED_BY',
]

export const DEFAULT_NEO_FILTERS: NeoGraphFilters = {
  kinds: {
    document: true,
    publication: true,
    agent: true,
    utterance: true,
    segment: true,
    entity: true,
    proposition: true,
    argument: true,
    viewpoint: true,
    controversy: true,
    dispute: true,
    assessment: false,
    evidence_check: false,
    citation: false,
    method_run: false,
    cluster: true,
  },
  edgeTypes: {
    PUBLISHED_BY: true,
    CONTAINS: true,
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
    VARIANT_OF: true,
    ABOUT: true,
    CHECKS: false,
    CITES: false,
    HELD_BY: false,
    DERIVED_FROM: false,
    PRODUCED_BY: false,
  },
}

/** Union 2.0: hide segments and analysis kinds so the nebula is discourse, not lattice. */
export const DEFAULT_UNION_V2_FILTERS: NeoGraphFilters = {
  kinds: {
    document: true,
    publication: true,
    agent: true,
    utterance: true,
    segment: false,
    entity: true,
    proposition: true,
    argument: true,
    viewpoint: true,
    controversy: true,
    dispute: true,
    assessment: false,
    evidence_check: false,
    citation: false,
    method_run: false,
    cluster: true,
  },
  edgeTypes: {
    PUBLISHED_BY: true,
    CONTAINS: true,
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
    VARIANT_OF: true,
    ABOUT: true,
    CHECKS: false,
    CITES: false,
    HELD_BY: false,
    DERIVED_FROM: false,
    PRODUCED_BY: false,
  },
}

export type NeoDocumentGraphSource = NeoDocumentGraph
