// Core types for Doxa

export type NodeStatus = 'draft' | 'under_review' | 'stable'

export type RelationshipType = 
  | 'parent_child' 
  | 'depends_on' 
  | 'contextual' 
  | 'related_event' 
  | 'shared_actor'

export type SourceType = 'article' | 'primary_document' | 'video' | 'podcast'

export interface Node {
  id: string
  question: string
  status: NodeStatus
  version: number
  parent_version_id: string | null
  shared_facts: Record<string, any> | null
  core_facts?: string | null
  coverage_summary?: string | null
  missing_perspectives?: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Perspective {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface NodePerspective {
  id: string
  node_id: string
  perspective_id: string
  core_claim: string
  key_arguments: string[]
  emphasis: string | null
  version: number
}

export interface NodeRelationship {
  id: string
  source_node_id: string
  target_node_id: string
  relationship_type: RelationshipType
  created_at: string
}

export interface Source {
  id: string
  node_id: string
  perspective_id: string | null
  url: string
  title: string
  source_type: SourceType
  created_at: string
}

export interface Validation {
  id: string
  node_id: string
  node_version: number
  perspective_id: string
  user_id: string
  is_represented: boolean
  feedback: string | null
  created_at: string
}

export interface Claim {
  id: string
  node_id: string
  text: string
  claim_type: string | null
  created_at: string
}

export interface ClaimSource {
  id: string
  claim_id: string
  source_id: string
  created_at: string
}

export interface PerspectiveVote {
  id: string
  node_id: string
  node_version: number
  perspective_id: string
  user_id: string | null
  vote_value: number
  reason: string | null
  created_at: string
}

export interface NodeWithDetails extends Node {
  perspectives: (NodePerspective & { perspective: Perspective })[]
  sources: Source[]
  relationships: (NodeRelationship & { 
    target_node: Node 
    source_node: Node 
  })[]
  validation_stats?: {
    perspective_id: string
    total_validations: number
    positive_validations: number
    validation_rate: number
  }[]
  vote_stats?: {
    perspective_id: string
    upvotes: number
    downvotes: number
    net_score: number
  }[]
}
