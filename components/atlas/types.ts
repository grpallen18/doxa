export interface VizNode {
  map_id: string
  entity_type: 'thesis' | 'claim' | 'story_claim'
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
