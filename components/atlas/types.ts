export interface VizNode {
  map_id: string
  entity_type: 'thesis' | 'viewpoint' | 'controversy' | 'topic' | 'claim' | 'story_claim' | 'source' | 'agreement' | 'position'
  entity_id: string
  x?: number
  y?: number
  layer: number
  size: number
  drift_seed?: number
  polarity_score?: number | null
  source_count?: number | null
  story_count?: number | null
}

export interface VizEdge {
  id: string
  map_id: string
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  edge_type: string
  weight: number
  similarity_score?: number | null
}

export interface StoryClaimInStory {
  story_claim_id: string
  raw_text: string | null
  linked_to_thesis?: boolean
  linked_to_viewpoint?: boolean
}

export interface StoryInSource {
  story_id: string
  title: string | null
  url: string | null
  published_at: string | null
  content_clean: string | null
  story_claims: StoryClaimInStory[]
}

export interface SourceDetail {
  source_id: string
  source_name: string
  story_count: number
  best_similarity: number
  stories: StoryInSource[]
}

/** Outer node in the force graph (viewpoint, source, controversy, claim, position, etc.) */
export interface OuterNode {
  entity_type: 'viewpoint' | 'source' | 'controversy' | 'claim' | 'position'
  entity_id: string
  label: string
}

/** Position detail for the side panel (agreement scope) */
export interface PositionDetail {
  canonical_position_id: string
  canonical_text: string | null
}

/** Claim detail for the side panel (position scope) */
export interface ClaimDetail {
  claim_id: string
  raw_text: string | null
}

/** Controversy detail for the side panel (topic scope) */
export interface ControversyDetail {
  controversy_cluster_id: string
  question: string | null
  summary: string | null
}

/** Viewpoint detail for the side panel (controversy scope) */
export interface ViewpointDetail {
  viewpoint_id: string
  controversy_cluster_id: string
  agreement_cluster_id: string
  position_cluster_id?: string
  title: string | null
  summary: string | null
}
