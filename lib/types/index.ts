// Core types for Doxa (target schema: README data dictionary)

export interface Topic {
  topic_id: string
  slug: string
  title: string
  summary: string | null
  status: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Source {
  source_id: string
  name: string
  domain: string | null
  bias_tags: string[]
  metadata: Record<string, unknown>
  created_at: string
}

export interface Story {
  story_id: string
  source_id: string
  url: string
  title: string
  author: string | null
  published_at: string | null
  fetched_at: string
  content_snippet: string | null
  content_full: string | null
  language: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface TopicStory {
  topic_id: string
  story_id: string
  assignment_method: string
  assignment_confidence: number | null
  run_id: string | null
  created_at: string
}

export interface PipelineRun {
  run_id: string
  pipeline_name: string
  status: string
  started_at: string
  ended_at: string | null
  model_provider: string | null
  model_name: string | null
  parameters: Record<string, unknown> | null
  counts: Record<string, unknown> | null
  error: string | null
}

export interface Claim {
  claim_id: string
  canonical_text: string
  canonical_hash: string
  subject: string | null
  predicate: string | null
  object: string | null
  timeframe: string | null
  location: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface StoryClaim {
  story_claim_id: string
  story_id: string
  raw_text: string
  polarity: string
  stance: string | null
  extraction_confidence: number
  span_start: number | null
  span_end: number | null
  claim_id: string | null
  run_id: string | null
  created_at: string
}

export interface StoryEvidence {
  evidence_id: string
  story_id: string
  evidence_type: string
  excerpt: string
  attribution: string | null
  source_ref: string | null
  span_start: number | null
  span_end: number | null
  extraction_confidence: number
  metadata: Record<string, unknown>
  run_id: string | null
  created_at: string
}

export interface Archetype {
  archetype_id: string
  name: string
  description: string | null
  created_at: string
}

export interface Thesis {
  thesis_id: string
  topic_id: string
  archetype_id: string
  label: string
  summary: string
  metadata: Record<string, unknown>
  run_id: string | null
  created_at: string
}

export interface Viewpoint {
  viewpoint_id: string
  topic_id: string
  archetype_id: string
  title: string
  summary: string
  metadata: Record<string, unknown>
  run_id: string | null
  created_at: string
}

export interface Narrative {
  narrative_id: string
  title: string
  summary: string
  metadata: Record<string, unknown>
  run_id: string | null
  created_at: string
}

export interface TopicThesis {
  thesis_id: string
  thesis_text: string | null
  similarity_score: number
  rank: number
}

export interface TopicRelationship {
  target_topic_id: string
  target_title: string
  target_slug: string
  similarity_score: number
}

export interface TopicWithDetails extends Topic {
  viewpoints: Viewpoint[]
  stories?: Story[]
  theses?: TopicThesis[]
  related_topics?: TopicRelationship[]
}
