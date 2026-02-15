export interface VizNode {
  map_id: string
  entity_type: 'thesis' | 'claim' | 'story_claim' | 'source'
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
